// 팀 가이드북 — 업로드 → 텍스트 추출 → 사람 확인 → 챗봇 반영.
//
// 왜 "사람 확인"이 중간에 있나: 가이드북은 파워포인트로 디자인한 PDF 라 장에 따라 글자가
// 이미지로 박혀 있다. 추출이 잘 될 때도 있고 표지만 읽힐 때도 있는데, **실패가 조용하면
// 챗봇이 엉뚱한 답을 하기 시작하고 아무도 원인을 모른다.** 그래서 뽑아낸 본문을 화면에 보여 주고
// 올린 사람이 확인·수정한 뒤에야 doc_chunks 에 들어간다(결정: PII 확인 절차와 같은 형태).
//
// 파일과 본문은 별개다:
//   - 파일(Storage) = 부원이 화면에서 그대로 보는 것. 추출이 실패해도 이건 된다.
//   - 본문(documents) = 챗봇이 읽는 것. 확인을 마쳐야 생긴다.

import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db/types';
import { CLUB_GUIDEBOOK_ID, clubGuidebooks, teamGuidebooks, teams, users, documents } from '@/db/schema';
import type { Actor } from '@/auth/permissions';
import { isPrivileged, leadsTeam } from '@/auth/permissions';
import { requireAuthorized } from '@/auth/guard';
import { buildAuditEntry, recordAudit } from '@/auth/audit';
import { extractPdfMarkdown } from '@/rag/gemini';
import { saveGuidebookDocument } from '@/rag/documents';
import {
  ALLOWED_GUIDEBOOK_TYPE,
  CLUB_GUIDEBOOK_PREFIX,
  MAX_GUIDEBOOK_BYTES,
  clubGuidebookPath,
  createGuidebookUploadUrl,
  createGuidebookViewUrl,
  deleteGuidebook,
  downloadGuidebook,
  guidebookPath,
  headGuidebook,
} from '@/storage/guidebooks';

export type Guidebook = typeof teamGuidebooks.$inferSelect;

/** 올린 파일이 규칙에 안 맞음(형식·크기). 라우트에서 400 으로 매핑. */
export class GuidebookRejectedError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'GuidebookRejectedError';
  }
}

const owner = (teamId: string) => ({ ownerType: 'team' as const, ownerId: teamId });

/**
 * 형식·크기 검문. 팀 것이든 전체 것이든 같은 규칙이라 한 자리에 둔다 — 두 벌로 두면
 * 상한을 올릴 때 한쪽만 고쳐 놓고 "왜 여기서는 되는데 저기서는 안 되지"가 된다.
 *
 * 여기서 **먼저** 막는 이유는 사용자의 시간이다(50MB 를 다 올린 뒤에 "안 됩니다"는 최악이다).
 * 다만 이것만으로는 방어가 아니다 — 업로드가 끝난 뒤 서버가 실제 파일을 다시 확인한다.
 */
function assertUploadable(contentType: string, fileBytes: number): void {
  if (contentType !== ALLOWED_GUIDEBOOK_TYPE) {
    throw new GuidebookRejectedError('PDF 파일만 올릴 수 있습니다. 파워포인트는 PDF 로 저장해 주세요.');
  }
  if (!Number.isFinite(fileBytes) || fileBytes <= 0) {
    throw new GuidebookRejectedError('파일 크기를 읽지 못했습니다.');
  }
  if (fileBytes > MAX_GUIDEBOOK_BYTES) {
    throw new GuidebookRejectedError(`파일이 너무 큽니다(최대 ${Math.floor(MAX_GUIDEBOOK_BYTES / 1024 / 1024)}MB).`);
  }
}

/** 업로드된 파일이 진짜 있고 규칙에 맞는지 서버가 직접 본다. 어긋나면 지우고 거절한다. */
async function verifyUploaded(path: string): Promise<{ bytes: number }> {
  const head = await headGuidebook(path);
  if (!head.ok) throw new GuidebookRejectedError('업로드된 파일을 찾지 못했습니다. 다시 올려 주세요.');
  if (head.bytes > MAX_GUIDEBOOK_BYTES) {
    await deleteGuidebook(path);
    throw new GuidebookRejectedError(`파일이 너무 큽니다(최대 ${Math.floor(MAX_GUIDEBOOK_BYTES / 1024 / 1024)}MB).`);
  }
  if (head.contentType && !head.contentType.startsWith('application/pdf')) {
    await deleteGuidebook(path);
    throw new GuidebookRejectedError('PDF 파일만 올릴 수 있습니다.');
  }
  return { bytes: head.bytes };
}

/** 가이드북 제목 — 챗봇 검색의 문맥 접두에 들어가므로 팀 이름이 반드시 보여야 한다. */
export function guidebookTitle(teamName: string): string {
  return `${teamName} 가이드북`;
}

// ── 1단계: 업로드 자리 발급 ────────────────────────────────────────────

/**
 * 브라우저가 파일을 직접 올릴 서명 URL 을 발급한다.
 *
 * 크기·형식을 **여기서 먼저** 막는 이유: 20MB 를 다 올린 뒤에 "안 됩니다"라고 하면 사용자가
 * 그 시간을 버린다. 물론 이것만으로는 방어가 아니다 — 업로드가 끝난 뒤 서버가 실제 파일을
 * 다시 확인한다(`registerUpload`). 클라이언트가 보낸 숫자는 신뢰하지 않는다.
 */
export async function createUploadTicket(
  db: Db,
  actor: Actor,
  input: { teamId: string; contentType: string; fileBytes: number }
): Promise<{ uploadUrl: string; path: string }> {
  requireAuthorized(actor, { kind: 'guidebook.manage', owner: owner(input.teamId) });

  const [team] = await db.select().from(teams).where(eq(teams.id, input.teamId)).limit(1);
  if (!team) throw new GuidebookRejectedError('없는 팀입니다.');

  assertUploadable(input.contentType, input.fileBytes);
  return createGuidebookUploadUrl(guidebookPath(input.teamId));
}

// ── 2단계: 업로드 확인 + 텍스트 추출 ───────────────────────────────────

export interface RegisterResult {
  guidebook: Guidebook;
  /** 추출된 본문(확인 대기). 실패했으면 null 이고 failReason 이 채워진다. */
  pendingText: string | null;
  failReason: string | null;
}

/**
 * 브라우저가 Storage 로 올린 파일을 시스템에 등록하고 텍스트를 뽑는다.
 *
 * 이 함수가 서버 쪽 진짜 검문소다. 업로드 자체는 브라우저 → Storage 로 곧장 갔기 때문에
 * 서버는 그 과정을 못 봤다. 그래서 여기서 **파일이 실제로 있는지·형식·크기**를 직접 확인한다.
 *
 * **행을 추출보다 먼저 남긴다**(status='extracting'). 예전에는 추출을 마친 뒤에 넣었는데,
 * 그러면 함수가 `maxDuration=60` 에 잘릴 때 행이 아예 안 생기고 파일만 스토리지에 떠돌았다 —
 * 화면에는 아무것도 안 보이니 올린 사람은 또 올리고, 고아 파일이 하나씩 쌓인다.
 * 먼저 남겨 두면 잘려도 **파일 보기는 되고**, 다시 올리거나 본문을 손으로 적어 넣을 수 있다.
 *
 * 추출이 실패해도 행은 남는다(status='failed'). 파일은 올라가 있으니 **부원이 보는 것은 되고**,
 * 챗봇만 모르는 상태다 — 올린 사람에게 "본문을 직접 넣어 달라"고 할 수 있는 자리가 된다.
 */
export async function registerUpload(
  db: Db,
  actor: Actor,
  input: { teamId: string; path: string; fileName: string }
): Promise<RegisterResult> {
  const decision = requireAuthorized(actor, { kind: 'guidebook.manage', owner: owner(input.teamId) });

  const [team] = await db.select().from(teams).where(eq(teams.id, input.teamId)).limit(1);
  if (!team) throw new GuidebookRejectedError('없는 팀입니다.');

  // 경로는 서버가 발급한 형태(`{teamId}/{uuid}.pdf`)여야 한다. 다른 팀 경로를 넘겨 남의 팀
  // 가이드북 자리에 파일을 끼워 넣는 것을 막는다.
  if (!new RegExp(`^${input.teamId}/[0-9a-f-]{36}\\.pdf$`).test(input.path)) {
    throw new GuidebookRejectedError('업로드 경로가 올바르지 않습니다.');
  }

  const { bytes } = await verifyUploaded(input.path);

  const [before] = await db.select().from(teamGuidebooks).where(eq(teamGuidebooks.teamId, input.teamId)).limit(1);

  const base = {
    teamId: input.teamId,
    storagePath: input.path,
    fileName: input.fileName.slice(0, 200),
    fileBytes: bytes,
    uploadedBy: actor.userId,
    updatedAt: new Date(),
    // 파일을 갈았으니 이전 본문은 더 이상 이 파일의 것이 아니다. 다만 documentId 는 유지해
    // 확인을 마칠 때 같은 문서 행을 덮어쓴다(검색에 옛 본문이 남지 않게).
    documentId: before?.documentId ?? null,
  };

  // ① 먼저 자리를 잡는다 — 여기서부터는 무슨 일이 나도 파일이 화면에서 사라지지 않는다.
  const opening = { ...base, status: 'extracting' as const, pendingText: null, failReason: null };
  await db
    .insert(teamGuidebooks)
    .values(opening)
    .onConflictDoUpdate({ target: teamGuidebooks.teamId, set: opening });

  // 옛 파일은 새 행이 저장된 뒤에 지운다(먼저 지우면 저장이 실패했을 때 둘 다 잃는다).
  if (before && before.storagePath !== input.path) await deleteGuidebook(before.storagePath);

  // ② 텍스트 추출 — 실패해도 등록은 유지한다(파일 보기는 되어야 하므로).
  let pendingText: string | null = null;
  let failReason: string | null = null;
  try {
    const out = await extractPdfMarkdown(await downloadGuidebook(input.path));
    if (out.empty) {
      failReason = '파일에서 글자를 거의 찾지 못했습니다. 슬라이드가 이미지로만 되어 있으면 이럴 수 있습니다.';
    } else {
      pendingText = out.markdown;
    }
  } catch (e) {
    failReason = e instanceof Error ? e.message : '텍스트를 뽑는 중 오류가 났습니다.';
  }

  // ③ 결과를 덮어쓴다.
  const [row] = await db
    .update(teamGuidebooks)
    .set({
      status: pendingText ? 'extracted' : 'failed',
      pendingText,
      failReason,
      updatedAt: new Date(),
    })
    .where(eq(teamGuidebooks.teamId, input.teamId))
    .returning();

  await recordAudit(
    db,
    buildAuditEntry({
      actorUserId: actor.userId,
      action: 'guidebook.upload',
      targetTable: 'team_guidebooks',
      targetId: row!.id,
      before: before ? { fileName: before.fileName } : null,
      after: { teamId: input.teamId, fileName: base.fileName, bytes, extracted: pendingText !== null },
      override: decision.override,
    })
  );

  return { guidebook: row!, pendingText, failReason };
}

// ── 3단계: 확인 → 챗봇 반영 ────────────────────────────────────────────

/**
 * 확인한 본문을 챗봇 지식베이스에 반영한다. 이 시점에야 doc_chunks 가 생긴다.
 *
 * `contentMd` 를 인자로 받는 이유: 화면에서 고칠 수 있게 하기 위해서다. 추출이 반쯤 어긋났을 때
 * 사람이 손으로 다듬는 것이 다시 올리는 것보다 빠르다. 추출을 아예 못 했어도 여기에 직접
 * 적어 넣으면 챗봇이 답할 수 있다.
 */
export async function confirmGuidebookText(
  db: Db,
  actor: Actor,
  input: { teamId: string; contentMd: string; piiAck?: boolean }
): Promise<Guidebook> {
  requireAuthorized(actor, { kind: 'guidebook.manage', owner: owner(input.teamId) });

  const [row] = await db.select().from(teamGuidebooks).where(eq(teamGuidebooks.teamId, input.teamId)).limit(1);
  if (!row) throw new GuidebookRejectedError('올라온 가이드북이 없습니다.');

  const contentMd = input.contentMd.trim();
  if (contentMd.length < 20) throw new GuidebookRejectedError('본문이 너무 짧습니다.');

  const [team] = await db.select().from(teams).where(eq(teams.id, input.teamId)).limit(1);

  // PII 가 잡히면 saveGuidebookDocument 가 PiiBlockedError 를 던진다(라우트가 422 로 옮긴다).
  const doc = await saveGuidebookDocument(db, actor, {
    teamId: input.teamId,
    title: guidebookTitle(team?.name ?? '팀'),
    contentMd,
    existingDocumentId: row.documentId,
    piiAck: input.piiAck,
  });

  const [updated] = await db
    .update(teamGuidebooks)
    .set({ documentId: doc.id, status: 'ready', pendingText: null, failReason: null, updatedAt: new Date() })
    .where(eq(teamGuidebooks.teamId, input.teamId))
    .returning();
  return updated!;
}

// ── 삭제 ───────────────────────────────────────────────────────────────

/** 가이드북 삭제 — 파일·본문·행을 함께 없앤다. 본문만 남으면 챗봇이 없는 자료를 근거로 답한다. */
export async function deleteTeamGuidebook(db: Db, actor: Actor, teamId: string): Promise<void> {
  const decision = requireAuthorized(actor, { kind: 'guidebook.manage', owner: owner(teamId) });

  const [row] = await db.select().from(teamGuidebooks).where(eq(teamGuidebooks.teamId, teamId)).limit(1);
  if (!row) return;

  await db.delete(teamGuidebooks).where(eq(teamGuidebooks.teamId, teamId));
  if (row.documentId) await db.delete(documents).where(eq(documents.id, row.documentId)); // doc_chunks 는 cascade
  await deleteGuidebook(row.storagePath);

  await recordAudit(
    db,
    buildAuditEntry({
      actorUserId: actor.userId,
      action: 'guidebook.delete',
      targetTable: 'team_guidebooks',
      targetId: row.id,
      before: { teamId, fileName: row.fileName },
      override: decision.override,
    })
  );
}

// ── 조회 ───────────────────────────────────────────────────────────────

export interface GuidebookView {
  teamId: string;
  teamName: string;
  /** 가이드북이 아직 없는 팀도 목록에 넣는다(부원에게 "없다"를 보여 주고, 팀장단에게 올릴 자리를 준다). */
  guidebook: {
    fileName: string;
    fileBytes: number;
    status: Guidebook['status'];
    /** 챗봇이 읽고 있는가. status==='ready' 와 같지만 화면 문구가 이 값을 직접 쓴다. */
    inChatbot: boolean;
    pendingText: string | null;
    failReason: string | null;
    uploadedByName: string | null;
    updatedAt: string;
    /** 서명된 보기 주소(만료 있음). 목록을 열 때마다 새로 발급한다. */
    viewUrl: string;
  } | null;
  /** 이 사람이 이 팀 가이드북을 올리고 지울 수 있는가(서버 판정 — 화면은 이 값으로 버튼을 그린다). */
  canManage: boolean;
}

/**
 * 팀별 가이드북 목록. **로그인한 전원**이 부른다(부원 포함).
 *
 * `pendingText` 는 관리 권한이 있는 사람에게만 실어 보낸다 — 확인 전 본문은 아직 검수되지 않은
 * 글이라 부원 화면에 나갈 이유가 없다(규칙 #6: 숨기는 것이 아니라 아예 보내지 않는다).
 */
export async function listGuidebooks(db: Db, actor: Actor): Promise<GuidebookView[]> {
  const rows = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      gb: teamGuidebooks,
      uploaderName: users.name,
    })
    .from(teams)
    .leftJoin(teamGuidebooks, eq(teamGuidebooks.teamId, teams.id))
    .leftJoin(users, eq(users.id, teamGuidebooks.uploadedBy))
    .where(and(eq(teams.isActive, true), eq(teams.kind, 'activity')));

  const out: GuidebookView[] = [];
  for (const r of rows) {
    const canManage = isPrivileged(actor.role) || leadsTeam(actor, r.teamId);
    let guidebook: GuidebookView['guidebook'] = null;
    if (r.gb) {
      guidebook = {
        fileName: r.gb.fileName,
        fileBytes: r.gb.fileBytes,
        status: r.gb.status,
        inChatbot: r.gb.status === 'ready',
        pendingText: canManage ? r.gb.pendingText : null,
        failReason: canManage ? r.gb.failReason : null,
        uploadedByName: r.uploaderName ?? null,
        updatedAt: r.gb.updatedAt.toISOString(),
        viewUrl: await createGuidebookViewUrl(r.gb.storagePath),
      };
    }
    out.push({ teamId: r.teamId, teamName: r.teamName, guidebook, canManage });
  }
  // 팀 이름 오름차순(1팀·2팀…)으로 보여 준다.
  return out.sort((a, b) => a.teamName.localeCompare(b.teamName, 'ko'));
}

// ── 동아리 전체 가이드북 ───────────────────────────────────────────────
// 팀 것과 흐름이 다르다: **추출 단계가 없다.** 챗봇이 읽지 않기로 했으므로(2026-09-03 사용자 결정)
// 올리면 곧바로 끝이고, 검수 상자도 챗봇 딱지도 없다. Gemini 를 부르지 않으니 60초 걱정도 없다.
//
// 이름은 늘 같다 — 칸이 하나뿐이라 구분할 것이 없다. 기수를 이름에 넣지 않는 이유:
// 새 기수마다 사람이 고쳐 줘야 하고, 안 고치면 33기 파일이 34기라고 적혀 있게 된다
// (아무도 파일을 건드리지 않았는데 표시가 거짓이 되는 쪽이 이름이 밋밋한 것보다 나쁘다).

/** 화면에 보이는 이름. 고정값이다(DB 에 제목 칸을 두지 않는다). */
export const CLUB_GUIDEBOOK_TITLE = '전체 부원 가이드북';

export type ClubGuidebook = typeof clubGuidebooks.$inferSelect;

/** 전체 가이드북 업로드 자리 발급. 회장단 전용. */
export async function createClubUploadTicket(
  actor: Actor,
  input: { contentType: string; fileBytes: number }
): Promise<{ uploadUrl: string; path: string }> {
  requireAuthorized(actor, { kind: 'clubGuidebook.manage' });
  assertUploadable(input.contentType, input.fileBytes);
  return createGuidebookUploadUrl(clubGuidebookPath());
}

/** 올라온 전체 가이드북을 등록한다(교체 포함). 팀 것과 달리 텍스트를 뽑지 않는다. */
export async function registerClubUpload(
  db: Db,
  actor: Actor,
  input: { path: string; fileName: string }
): Promise<ClubGuidebook> {
  const decision = requireAuthorized(actor, { kind: 'clubGuidebook.manage' });

  if (!new RegExp(`^${CLUB_GUIDEBOOK_PREFIX}/[0-9a-f-]{36}\.pdf$`).test(input.path)) {
    throw new GuidebookRejectedError('업로드 경로가 올바르지 않습니다.');
  }
  const { bytes } = await verifyUploaded(input.path);

  const [before] = await db.select().from(clubGuidebooks).where(eq(clubGuidebooks.id, CLUB_GUIDEBOOK_ID)).limit(1);

  const values = {
    id: CLUB_GUIDEBOOK_ID,
    storagePath: input.path,
    fileName: input.fileName.slice(0, 200),
    fileBytes: bytes,
    uploadedBy: actor.userId,
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(clubGuidebooks)
    .values(values)
    .onConflictDoUpdate({ target: clubGuidebooks.id, set: values })
    .returning();

  // 옛 파일은 새 행이 저장된 뒤에 지운다(먼저 지우면 저장이 실패했을 때 둘 다 잃는다).
  if (before && before.storagePath !== input.path) await deleteGuidebook(before.storagePath);

  await recordAudit(
    db,
    buildAuditEntry({
      actorUserId: actor.userId,
      action: 'guidebook.club.upload',
      targetTable: 'club_guidebooks',
      targetId: row!.id,
      before: before ? { fileName: before.fileName } : null,
      after: { fileName: values.fileName, bytes },
      override: decision.override,
    })
  );
  return row!;
}

/** 전체 가이드북 삭제 — 파일과 행을 함께 없앤다(챗봇이 읽는 본문은 애초에 없다). */
export async function deleteClubGuidebook(db: Db, actor: Actor): Promise<void> {
  const decision = requireAuthorized(actor, { kind: 'clubGuidebook.manage' });

  const [row] = await db.select().from(clubGuidebooks).where(eq(clubGuidebooks.id, CLUB_GUIDEBOOK_ID)).limit(1);
  if (!row) return;

  await db.delete(clubGuidebooks).where(eq(clubGuidebooks.id, CLUB_GUIDEBOOK_ID));
  await deleteGuidebook(row.storagePath);

  await recordAudit(
    db,
    buildAuditEntry({
      actorUserId: actor.userId,
      action: 'guidebook.club.delete',
      targetTable: 'club_guidebooks',
      targetId: row.id,
      before: { fileName: row.fileName },
      override: decision.override,
    })
  );
}

export interface ClubGuidebookView {
  fileName: string;
  fileBytes: number;
  uploadedByName: string | null;
  updatedAt: string;
  /** 서명된 보기 주소(만료 있음). 화면을 열 때마다 새로 발급한다. */
  viewUrl: string;
}

/**
 * 전체 가이드북 한 건. **로그인한 전원**이 부른다(부원 포함) — 애초에 부원 보라고 올리는 자료다.
 * 아직 없으면 null 이고, 화면은 회장단에게만 "올릴 자리"를 그린다.
 */
export async function getClubGuidebook(db: Db): Promise<ClubGuidebookView | null> {
  const [r] = await db
    .select({ gb: clubGuidebooks, uploaderName: users.name })
    .from(clubGuidebooks)
    .leftJoin(users, eq(users.id, clubGuidebooks.uploadedBy))
    .where(eq(clubGuidebooks.id, CLUB_GUIDEBOOK_ID))
    .limit(1);
  if (!r) return null;

  return {
    fileName: r.gb.fileName,
    fileBytes: r.gb.fileBytes,
    uploadedByName: r.uploaderName ?? null,
    updatedAt: r.gb.updatedAt.toISOString(),
    viewUrl: await createGuidebookViewUrl(r.gb.storagePath),
  };
}
