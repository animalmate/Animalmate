// 문서(RAG 지식베이스) CRUD + 저장 시 재청킹·재임베딩 파이프라인.
//
// 저장 흐름: 권한 확인 → PII 감지(확인 없으면 차단) → 임베딩(네트워크, 트랜잭션 밖) →
// 트랜잭션(문서 upsert + doc_chunks 통째 교체) → audit.
// 임베딩을 트랜잭션 밖에서 먼저 하는 이유: 외부 API 호출을 DB 트랜잭션 안에 넣으면 커넥션을
// 오래 잡는다. 임베딩이 성공한 뒤에야 짧은 트랜잭션으로 원자적으로 쓴다.
//
// visibility(member|staff|board)는 **챗봇 검색 노출 범위**다. 편집 권한(소유권)과는 별개다:
// 편집은 소유자(개인 본인/소속 팀) + 회장단, 검색 노출은 visibility ≤ 질문자 역할(search.ts).

import { and, desc, eq, inArray, or, type SQL } from 'drizzle-orm';
import type { Db } from '@/db/types';
import { documents, docChunks } from '@/db/schema';
import type { Actor, OwnerType } from '@/auth/permissions';
import { isPrivileged } from '@/auth/permissions';
import { requireAuthorized } from '@/auth/guard';
import { buildAuditEntry, recordAudit } from '@/auth/audit';
import { chunkDocument } from './chunking';
import { embedTexts } from './gemini';
import { detectPii, type PiiFinding } from './pii';

export type Document = typeof documents.$inferSelect;
export type Visibility = Document['visibility'];

export interface DocumentInput {
  title: string;
  contentMd: string;
  visibility: Visibility;
  ownerType: Extract<OwnerType, 'personal' | 'team'>;
  ownerId: string; // personal=userId, team=teamId
  /** PII 경고를 확인하고 그래도 저장하겠다는 명시. false 인데 PII 가 잡히면 저장을 막는다. */
  piiAck?: boolean;
}

/** PII 가 감지됐는데 확인(piiAck)이 없어 저장을 막음. 라우트에서 422 + findings 로 매핑. */
export class PiiBlockedError extends Error {
  readonly status = 422;
  constructor(readonly findings: PiiFinding[]) {
    super('개인정보로 보이는 내용이 있어 저장을 보류했습니다.');
    this.name = 'PiiBlockedError';
  }
}

const ownershipOf = (d: { ownerType: string; ownerId: string }) => ({
  ownerType: d.ownerType as OwnerType,
  ownerId: d.ownerId,
});

/** 제목+본문 → 청크 → 임베딩(RETRIEVAL_DOCUMENT). 네트워크 호출이라 트랜잭션 밖에서 부른다. */
async function embedChunks(title: string, contentMd: string): Promise<{ index: number; content: string; embedding: number[] }[]> {
  const chunks = chunkDocument(title, contentMd);
  if (chunks.length === 0) return [];
  const vectors = await embedTexts(chunks.map((c) => c.content), 'RETRIEVAL_DOCUMENT');
  return chunks.map((c, i) => ({ index: c.index, content: c.content, embedding: vectors[i]! }));
}

async function writeChunks(tx: Db, documentId: string, rows: { index: number; content: string; embedding: number[] }[]): Promise<void> {
  await tx.delete(docChunks).where(eq(docChunks.documentId, documentId)); // 통째 교체(부분 갱신 안 함)
  if (rows.length === 0) return;
  await tx.insert(docChunks).values(
    rows.map((r) => ({ documentId, chunkIndex: r.index, content: r.content, embedding: r.embedding }))
  );
}

export async function createDocument(db: Db, actor: Actor, input: DocumentInput): Promise<Document> {
  requireAuthorized(actor, { kind: 'document.modify', owner: { ownerType: input.ownerType, ownerId: input.ownerId } });

  const findings = detectPii(input.contentMd);
  if (findings.length > 0 && !input.piiAck) throw new PiiBlockedError(findings);

  const chunkRows = await embedChunks(input.title, input.contentMd);

  const doc = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(documents)
      .values({
        title: input.title,
        contentMd: input.contentMd,
        visibility: input.visibility,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        updatedBy: actor.userId,
        piiChecked: findings.length > 0, // PII 를 확인하고 통과시켰다는 기록
      })
      .returning();
    await writeChunks(tx, row!.id, chunkRows);
    return row!;
  });

  await recordAudit(
    db,
    buildAuditEntry({ actorUserId: actor.userId, action: 'document.create', targetTable: 'documents', targetId: doc.id, after: { title: doc.title, visibility: doc.visibility, chunks: chunkRows.length } })
  );
  return doc;
}

/**
 * 팀 가이드북 본문을 챗봇 지식베이스에 올린다(팀당 한 건, 있으면 교체).
 *
 * `createDocument` 를 쓰지 않는 이유는 **권한이 다르기 때문**이다. 지식베이스 문서 관리는
 * 회장단 전용(`document.modify`)이지만, 가이드북은 그 팀의 팀장단이 직접 올린다
 * (`guidebook.manage`). 파이프라인(PII 검사 → 청킹 → 임베딩 → 통째 교체)은 똑같이 쓴다.
 *
 * 공개 범위는 **member 고정**이다. 가이드북은 애초에 부원에게 보여 주려고 만드는 자료라
 * 고를 이유가 없고, 고르게 두면 실수로 부원에게 안 보이게 저장되는 쪽이 더 나쁘다.
 */
export async function saveGuidebookDocument(
  db: Db,
  actor: Actor,
  input: { teamId: string; title: string; contentMd: string; existingDocumentId?: string | null; piiAck?: boolean }
): Promise<Document> {
  const owner = { ownerType: 'team' as const, ownerId: input.teamId };
  requireAuthorized(actor, { kind: 'guidebook.manage', owner });

  const findings = detectPii(input.contentMd);
  if (findings.length > 0 && !input.piiAck) throw new PiiBlockedError(findings);

  const chunkRows = await embedChunks(input.title, input.contentMd);

  // 기존 행이 있으면 갱신한다 — 새로 만들면 옛 가이드북 본문이 검색에 남아 챗봇이 낡은 쪽을 집는다.
  const existing = input.existingDocumentId
    ? (await db.select().from(documents).where(eq(documents.id, input.existingDocumentId)).limit(1))[0]
    : undefined;

  const doc = await db.transaction(async (tx) => {
    if (existing) {
      const [row] = await tx
        .update(documents)
        .set({
          title: input.title,
          contentMd: input.contentMd,
          visibility: 'member',
          updatedBy: actor.userId,
          updatedAt: new Date(),
          piiChecked: findings.length > 0,
        })
        .where(eq(documents.id, existing.id))
        .returning();
      await writeChunks(tx, existing.id, chunkRows);
      return row!;
    }
    const [row] = await tx
      .insert(documents)
      .values({
        title: input.title,
        contentMd: input.contentMd,
        visibility: 'member',
        ownerType: 'team',
        ownerId: input.teamId,
        kind: 'guidebook',
        updatedBy: actor.userId,
        piiChecked: findings.length > 0,
      })
      .returning();
    await writeChunks(tx, row!.id, chunkRows);
    return row!;
  });

  await recordAudit(
    db,
    buildAuditEntry({
      actorUserId: actor.userId,
      action: existing ? 'guidebook.document.update' : 'guidebook.document.create',
      targetTable: 'documents',
      targetId: doc.id,
      after: { title: doc.title, teamId: input.teamId, chunks: chunkRows.length },
    })
  );
  return doc;
}

export type DocumentPatch = Partial<Pick<DocumentInput, 'title' | 'contentMd' | 'visibility' | 'piiAck'>>;

export async function updateDocument(db: Db, actor: Actor, id: string, patch: DocumentPatch): Promise<Document> {
  const [before] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!before) throw new Error(`document not found: ${id}`);
  requireAuthorized(actor, { kind: 'document.modify', owner: ownershipOf(before) });

  const title = patch.title ?? before.title;
  const contentMd = patch.contentMd ?? before.contentMd;
  const contentChanged = patch.contentMd !== undefined && patch.contentMd !== before.contentMd;
  const titleChanged = patch.title !== undefined && patch.title !== before.title;

  if (contentChanged) {
    const findings = detectPii(contentMd);
    if (findings.length > 0 && !patch.piiAck) throw new PiiBlockedError(findings);
  }

  // 제목·본문이 바뀌면 임베딩을 다시 만든다(문맥 접두에 제목이 들어가므로 제목만 바뀌어도 재색인).
  const chunkRows = titleChanged || contentChanged ? await embedChunks(title, contentMd) : null;

  const doc = await db.transaction(async (tx) => {
    const set: Partial<Document> = { updatedBy: actor.userId, updatedAt: new Date() };
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.contentMd !== undefined) set.contentMd = patch.contentMd;
    if (patch.visibility !== undefined) set.visibility = patch.visibility;
    if (contentChanged) set.piiChecked = detectPii(contentMd).length > 0;
    const [row] = await tx.update(documents).set(set).where(eq(documents.id, id)).returning();
    if (chunkRows) await writeChunks(tx, id, chunkRows);
    return row!;
  });

  await recordAudit(
    db,
    buildAuditEntry({ actorUserId: actor.userId, action: 'document.update', targetTable: 'documents', targetId: id, before: { title: before.title, visibility: before.visibility }, after: { title: doc.title, visibility: doc.visibility, reindexed: chunkRows !== null } })
  );
  return doc;
}

export async function deleteDocument(db: Db, actor: Actor, id: string): Promise<void> {
  const [before] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!before) throw new Error(`document not found: ${id}`);
  requireAuthorized(actor, { kind: 'document.modify', owner: ownershipOf(before) });
  await db.delete(documents).where(eq(documents.id, id)); // doc_chunks 는 FK cascade 로 함께 삭제
  await recordAudit(
    db,
    buildAuditEntry({ actorUserId: actor.userId, action: 'document.delete', targetTable: 'documents', targetId: id, before: { title: before.title } })
  );
}

export interface DocumentRow {
  id: string;
  title: string;
  visibility: Visibility;
  ownerType: string;
  ownerId: string;
  updatedAt: string;
  piiChecked: boolean;
}

/**
 * 관리(편집) 목록 — 편집 권한 스코프로 필터한다(챗봇 검색 스코프와 다름).
 * 회장단·시스템관리자: 전체. 그 외 운영진: 본인 개인 + 소속 팀 문서.
 */
export async function listDocuments(db: Db, actor: Actor): Promise<DocumentRow[]> {
  let where: SQL | undefined;
  if (!isPrivileged(actor.role)) {
    const teamIds = actor.teams.map((t) => t.teamId);
    const conds = [and(eq(documents.ownerType, 'personal'), eq(documents.ownerId, actor.userId))];
    if (teamIds.length) conds.push(and(eq(documents.ownerType, 'team'), inArray(documents.ownerId, teamIds)));
    where = or(...conds);
  }
  // 가이드북 본문은 이 목록에 넣지 않는다 — 관리하는 곳이 `/guidebooks` 로 따로 있고,
  // 여기 섞이면 회장단이 손으로 쓴 문서를 찾기 어려워진다. 챗봇 검색은 둘을 구분하지 않는다.
  const manualOnly = eq(documents.kind, 'manual');
  const rows = await db
    .select()
    .from(documents)
    .where(where ? and(manualOnly, where) : manualOnly)
    .orderBy(desc(documents.updatedAt));
  return rows.map((d) => ({
    id: d.id,
    title: d.title,
    visibility: d.visibility,
    ownerType: d.ownerType,
    ownerId: d.ownerId,
    updatedAt: d.updatedAt.toISOString(),
    piiChecked: d.piiChecked,
  }));
}

export async function getDocument(db: Db, id: string): Promise<Document | null> {
  const [row] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return row ?? null;
}

// 등급 정의는 `@/auth/visibility` 로 옮겼다(일정 캘린더가 같은 필터를 쓰면서 정의가 둘이 되면 안 된다).
// 기존 import 경로를 깨지 않도록 여기서 다시 내보낸다.
export { VISIBILITY_RANK, roleVisibilityRank } from '@/auth/visibility';
