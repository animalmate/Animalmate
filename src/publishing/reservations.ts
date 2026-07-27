// 예약(scheduled_post) 생성/조회 — 일반 공지(개인 소유) + 봉사 공지(팀 소유 + event 통합).
// 예약 큐 화면·작성 폼의 서버 진입점. 권한은 post.create(운영진 이상).

import { and, asc, eq, gte, inArray, lt, ne, or, type SQL } from 'drizzle-orm';
import type { Db } from '@/db/types';
import { scheduledPosts, events, boards } from '@/db/schema';
import { composeTeamLeaders } from '@/org/team-leaders';
import { dateVars, kstDateStr } from './placeholders';
import { isPrivileged, type Actor } from '@/auth/permissions';
import { requireAuthorized } from '@/auth/guard';
import { buildAuditEntry, recordAudit } from '@/auth/audit';
import { getTemplate, renderTemplate } from './post-templates';
import { getWritableBoard } from '@/boards/service';
import { publishVars, usedPlaceholders, renderForPublish, type UsedPlaceholder } from './final-render';

export type ScheduledPost = typeof scheduledPosts.$inferSelect;

/** 봇이 쓸 수 없는 게시판으로 예약을 만들려 함. 라우트에서 400 으로 매핑. */
export class BoardNotWritableError extends Error {
  readonly status = 400;
  constructor(readonly menuid: number) {
    super(`board not writable: menuid=${menuid}`);
    this.name = 'BoardNotWritableError';
  }
}

/** 한 요청에서 만들 수 있는 예약 건수 상한(요청 하나로 발행 큐를 채우는 것을 막는다). */
export const MAX_OCCURRENCES = 60;

export interface CreateGeneralInput {
  kind: 'general';
  boardMenuid: number;
  title: string;
  contentMd: string;
  publishAt?: Date | null;
}
export interface CreateVolunteerInput {
  kind: 'volunteer';
  teamId: string;
  boardMenuid: number;
  title: string;
  contentMd: string;
  publishAt?: Date | null;
  eventDate?: string | null; // 'YYYY-MM-DD'
  meetTime?: string | null; // 'HH:MM'
  place?: string | null;
  capacity?: number | null;
}
export type CreateReservationInput = CreateGeneralInput | CreateVolunteerInput;

/** 같은 시각에 이미 예약이 있어 새로 잡을 수 없을 때. */
export class SlotTakenError extends Error {
  constructor(readonly conflictTitle: string, readonly publishAt: Date) {
    super(`이미 같은 시각(${kstMinuteLabel(publishAt)})에 예약된 글이 있습니다: "${conflictTitle}"`);
  }
}

/** 화면·오류 문구용 한국 시각 라벨(분 단위). */
function kstMinuteLabel(d: Date): string {
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' });
}

/**
 * 같은 분에 이미 잡힌 예약을 찾는다. 없으면 null.
 *
 * 팀별 발행 시각이 30분 간격으로 정해져 있어(그 사이에 번개·일반 공지가 들어간다), 같은 분에
 * 두 건이 잡히는 것은 사실상 슬롯 중복 예약이다. 분 단위로만 막아서 "팀 공지 직후 번개 공지"
 * 같은 정상 사용은 그대로 둔다.
 *
 * 주의: 이 검사는 발행 워커의 점유(claim)를 대신하지 않는다. 예약 시각이 벌어져 있어도
 * 카페 응답 지연이나 크론 유실 뒤 밀린 글 때문에 발행 시점에는 겹칠 수 있다.
 */
export async function findSlotConflict(
  db: Db,
  publishAt: Date,
  excludePostId?: string
): Promise<{ id: string; title: string } | null> {
  const minuteStart = new Date(publishAt);
  minuteStart.setSeconds(0, 0);
  const minuteEnd = new Date(minuteStart.getTime() + 60_000);

  const conditions = [
    // 아직 발행되지 않아 그 시각을 차지하는 글들(published·failed 는 자리를 비운 것으로 본다).
    inArray(scheduledPosts.status, ['draft', 'ready', 'scheduled', 'publishing'] as const),
    gte(scheduledPosts.publishAt, minuteStart),
    lt(scheduledPosts.publishAt, minuteEnd),
  ];
  if (excludePostId) conditions.push(ne(scheduledPosts.id, excludePostId));

  const [found] = await db
    .select({ id: scheduledPosts.id, title: scheduledPosts.title })
    .from(scheduledPosts)
    .where(and(...conditions))
    .limit(1);
  return found ?? null;
}

export async function createReservation(db: Db, actor: Actor, input: CreateReservationInput): Promise<ScheduledPost> {
  // 일반(개인) 공지 = post.create(운영진). 봉사(팀) 공지 = 팀 소유 스코프(팀장은 소속 팀만, 회장단 override).
  if (input.kind === 'volunteer') {
    requireAuthorized(actor, { kind: 'recurring.manage', owner: { ownerType: 'team', ownerId: input.teamId } });
  } else {
    requireAuthorized(actor, { kind: 'post.create' });
  }

  // 게시판 게이트: 등록·활성·봇 쓰기 허용된 게시판에만 예약할 수 있다(레지스트리는 회장단만 관리).
  if (!(await getWritableBoard(db, input.boardMenuid))) throw new BoardNotWritableError(input.boardMenuid);

  // 슬롯 중복 예약 차단(팀별 발행 시각이 30분 간격으로 정해져 있다).
  if (input.publishAt) {
    const conflict = await findSlotConflict(db, input.publishAt);
    if (conflict) throw new SlotTakenError(conflict.title, input.publishAt);
  }

  if (input.kind === 'general') {
    const [post] = await db
      .insert(scheduledPosts)
      .values({
        ownerType: 'personal',
        ownerId: actor.userId,
        authorUserId: actor.userId,
        boardMenuid: input.boardMenuid,
        title: input.title,
        contentMd: input.contentMd,
        publishAt: input.publishAt ?? null,
        status: 'draft',
      })
      .returning();
    await recordAudit(db, buildAuditEntry({ actorUserId: actor.userId, action: 'post.create', targetTable: 'scheduled_posts', targetId: post!.id, after: post }));
    await autoDetermineStatus(db, post!.id);
    const [updated] = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, post!.id)).limit(1);
    return updated!;
  }

  // 봉사 공지: event + post 동시 생성(팀 소유).
  return db.transaction(async (tx) => {
    const [ev] = await tx
      .insert(events)
      .values({
        teamId: input.teamId,
        title: input.title,
        eventDate: input.eventDate ?? null,
        meetTime: input.meetTime ?? null,
        place: input.place ?? null,
        capacity: input.capacity ?? null,
        status: 'draft',
      })
      .returning();
    const [post] = await tx
      .insert(scheduledPosts)
      .values({
        ownerType: 'team',
        ownerId: input.teamId,
        authorUserId: actor.userId,
        boardMenuid: input.boardMenuid,
        eventId: ev!.id,
        title: input.title,
        contentMd: input.contentMd,
        publishAt: input.publishAt ?? null,
        status: 'draft',
      })
      .returning();
    await recordAudit(tx, buildAuditEntry({ actorUserId: actor.userId, action: 'post.create', targetTable: 'scheduled_posts', targetId: post!.id, after: { eventId: ev!.id } }));
    await autoDetermineStatus(tx, post!.id);
    const [updated] = await tx.select().from(scheduledPosts).where(eq(scheduledPosts.id, post!.id)).limit(1);
    return updated!;
  });
}

// ── 다건 생성 ──────────────────────────────────────────────────────────
export interface SharedFields {
  kind: 'general' | 'volunteer';
  teamId?: string;
  boardMenuid: number;
  title: string;
  contentMd: string;
  /** 불러온 양식. 기본 장소·정원을 각 회차(events)의 초기값으로 복사한다. */
  templateId?: string | null;
}
export interface Occurrence {
  publishAt: Date | null;
  eventDate?: string | null; // 봉사 공지일 때
  meetTime?: string | null;
  capacity?: number | null; // 회차별 정원. 비우면 양식의 기본 정원을 쓴다.
}

/**
 * 발행 시각/봉사 일자를 여러 개 지정해 예약 N건을 한 번에 만든다. 각 건은 이후 개별 수정 가능.
 * 제목/본문의 {{간결_날짜}}{{전체_날짜}}{{집합시간}}{{팀장단}} 을 각 건 값으로 자동 치환(빈 값이면 그대로 둠).
 * {{장소}}{{정원}}은 본문에 남겨 두고 발행 직전에 events 값으로 치환한다(final-render).
 * 양식에 기본 장소·정원이 있으면 각 회차(events)의 초기값으로 복사된다.
 */
/**
 * 요청자가 실제로 쓸 수 있는 양식일 때만 반환(아니면 null — 조용히 기본값 없이 진행).
 * 목록 스코프(listUsableTemplates)와 같은 규칙을 쓰므로 화면에 보이지 않는 양식은 여기서도 안 보인다.
 */
async function loadUsableTemplate(db: Db, actor: Actor, templateId: string) {
  const tpl = await getTemplate(db, templateId);
  if (!tpl) return null;
  if (isPrivileged(actor.role)) return tpl;
  if (tpl.ownerType === 'global') return tpl;
  if (tpl.ownerType === 'personal') return tpl.ownerId === actor.userId ? tpl : null;
  return actor.teams.some((t) => t.teamId === tpl.ownerId) ? tpl : null;
}

export interface MultiCreateResult {
  ids: string[];
  /** 같은 시각에 이미 예약이 있어 만들지 않은 회차. 한 건 때문에 전체를 막지 않는다. */
  skipped: { publishAt: string; conflictTitle: string }[];
}

export async function createReservationsMulti(
  db: Db,
  actor: Actor,
  shared: SharedFields,
  occurrences: Occurrence[]
): Promise<MultiCreateResult> {
  if (occurrences.length > MAX_OCCURRENCES) {
    throw new Error(`한 번에 만들 수 있는 예약은 최대 ${MAX_OCCURRENCES}건입니다.`);
  }
  // 봉사 공지면 팀장단 명단(자동+수동)을 한 번만 조회.
  let leaders = '';
  if (shared.kind === 'volunteer' && shared.teamId) {
    leaders = await composeTeamLeaders(db, shared.teamId);
  }
  // 양식의 기본 장소·정원(장소별 양식). 없으면 null 로 두고 예약 수정에서 채운다.
  // templateId 는 요청 본문에서 오므로 "이 사용자가 쓸 수 있는 양식인지"를 확인한다.
  // (확인 없이 조회하면 남의 팀 양식 id 를 넣어 그 팀의 기본 장소·정원을 읽어낼 수 있다.)
  const template = shared.templateId ? await loadUsableTemplate(db, actor, shared.templateId) : null;

  const ids: string[] = [];
  const skipped: MultiCreateResult['skipped'] = [];
  // 이 배치 안에서 같은 분이 두 번 나오는 것도 막는다(DB 에는 아직 없으니 조회로는 안 잡힌다).
  const takenInBatch = new Set<number>();

  for (const occ of occurrences) {
    if (occ.publishAt) {
      const minute = new Date(occ.publishAt).setSeconds(0, 0);
      const conflict = takenInBatch.has(minute)
        ? { title: '같은 요청 안의 다른 회차' }
        : await findSlotConflict(db, occ.publishAt);
      if (conflict) {
        // 반복 예약은 12~60건이라 한 회차가 겹친다고 전체를 버리면 손해가 크다 — 그 건만 빼고 알린다.
        skipped.push({ publishAt: occ.publishAt.toISOString(), conflictTitle: conflict.title });
        continue;
      }
      takenInBatch.add(minute);
    }

    const vars: Record<string, string> = {};
    if (shared.kind === 'volunteer') {
      Object.assign(vars, dateVars(occ.eventDate));
      if (occ.meetTime) vars['집합시간'] = occ.meetTime;
      if (leaders) vars['팀장단'] = leaders;
    } else if (occ.publishAt) {
      Object.assign(vars, dateVars(kstDateStr(occ.publishAt)));
    }
    const title = renderTemplate(shared.title, vars);
    const contentMd = renderTemplate(shared.contentMd, vars);

    const input: CreateReservationInput =
      shared.kind === 'volunteer'
        ? {
            kind: 'volunteer',
            teamId: String(shared.teamId),
            boardMenuid: shared.boardMenuid,
            title,
            contentMd,
            publishAt: occ.publishAt ?? null,
            eventDate: occ.eventDate ?? null,
            meetTime: occ.meetTime ?? null,
            place: template?.defaultPlace ?? null,
            capacity: occ.capacity ?? template?.defaultCapacity ?? null, // 회차별 지정 > 양식 기본값
          }
        : { kind: 'general', boardMenuid: shared.boardMenuid, title, contentMd, publishAt: occ.publishAt ?? null };
    const post = await createReservation(db, actor, input);
    ids.push(post.id);
  }
  return { ids, skipped };
}

// ── 개별 조회/수정 ─────────────────────────────────────────────────────
export interface ReservationDetail {
  post: ScheduledPost;
  event: typeof events.$inferSelect | null;
}

export async function getReservation(db: Db, id: string): Promise<ReservationDetail | null> {
  const [post] = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, id)).limit(1);
  if (!post) return null;
  let event: typeof events.$inferSelect | null = null;
  if (post.eventId) {
    const [ev] = await db.select().from(events).where(eq(events.id, post.eventId)).limit(1);
    event = ev ?? null;
  }
  return { post, event };
}

export interface UpdateReservationPatch {
  title?: string;
  contentMd?: string;
  publishAt?: Date | null;
  eventDate?: string | null;
  meetTime?: string | null;
  place?: string | null;
  capacity?: number | null;
}

/** 예약 개별 수정(published 전까지). 소유자/회장단. post + 연결 event 필드 갱신 후 상태 자동 판정. */
export async function updateReservation(db: Db, actor: Actor, id: string, patch: UpdateReservationPatch): Promise<void> {
  const [post] = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, id)).limit(1);
  if (!post) throw new Error(`scheduled_post not found: ${id}`);
  requireAuthorized(actor, { kind: 'post.modify', owner: { ownerType: post.ownerType, ownerId: post.ownerId } });
  if (post.status === 'published') throw new Error('발행된 예약은 수정할 수 없습니다.');
  // 워커가 이미 집어 간 글은 지금 카페로 나가는 중이다 — 이 시점의 수정은 반영되지 않으므로 막는다.
  if (post.status === 'publishing') throw new Error('지금 업로드 중인 예약은 수정할 수 없습니다.');

  // 시각을 옮길 때도 슬롯 중복을 막는다(자기 자신은 제외).
  if (patch.publishAt) {
    const conflict = await findSlotConflict(db, patch.publishAt, id);
    if (conflict) throw new SlotTakenError(conflict.title, patch.publishAt);
  }

  const postSet: Partial<ScheduledPost> = { updatedAt: new Date() };
  if (patch.title !== undefined) postSet.title = patch.title;
  if (patch.contentMd !== undefined) postSet.contentMd = patch.contentMd;
  if (patch.publishAt !== undefined) postSet.publishAt = patch.publishAt;
  await db.update(scheduledPosts).set(postSet).where(eq(scheduledPosts.id, id));

  if (post.eventId) {
    const evSet: Partial<typeof events.$inferSelect> = {};
    if (patch.eventDate !== undefined) evSet.eventDate = patch.eventDate;
    if (patch.meetTime !== undefined) evSet.meetTime = patch.meetTime;
    if (patch.place !== undefined) evSet.place = patch.place;
    if (patch.capacity !== undefined) evSet.capacity = patch.capacity;
    if (Object.keys(evSet).length > 0) await db.update(events).set(evSet).where(eq(events.id, post.eventId));
  }

  await recordAudit(
    db,
    buildAuditEntry({ actorUserId: actor.userId, action: 'post.update', targetTable: 'scheduled_posts', targetId: id, after: patch })
  );

  // 수정 후 필수 항목 충족 여부에 따라 상태 자동 판정 (scheduled / draft)
  await autoDetermineStatus(db, id);
}

export interface ReservationRow {
  id: string;
  title: string;
  status: string;
  boardMenuid: number;
  boardName: string | null; // 화면 표시용(menuid 는 운영 설정값이라 노출하지 않는다)
  publishAt: string | null;
  cafeArticleUrl: string | null;
  ownerType: string;
  ownerId: string;
  failReason: string | null; // failed 일 때 실패 사유
  event: { eventDate: string | null; meetTime: string | null; place: string | null; capacity: number | null } | null;
  missing: string[]; // draft 일 때 부족한 필수 필드
  /** 이 글이 쓰는 플레이스홀더와 발행 시 들어갈 값(value=null 이면 미치환 = 발행 차단). */
  placeholders: UsedPlaceholder[];
}

export function computeMissing(
  p: ScheduledPost,
  ev: typeof events.$inferSelect | null,
  unresolvedKeys: string[] = []
): string[] {
  const m: string[] = [];
  if (!p.title?.trim()) m.push('제목');
  if (!p.contentMd?.trim()) m.push('본문');
  if (p.publishAt == null) m.push('업로드 시각');
  if (p.boardMenuid == null) m.push('게시판');
  if (p.eventId) {
    if (!ev) {
      m.push('봉사회차');
    } else {
      if (ev.eventDate == null) m.push('일시');
      if (!ev.place?.trim()) m.push('장소');
      if (ev.capacity == null) m.push('정원');
    }
  }
  for (const k of unresolvedKeys) {
    if (!m.includes(`{{${k}}}`)) {
      m.push(`{{${k}}}`);
    }
  }
  return m;
}

/** 필수 항목 충족 여부에 따라 상태 자동 판정 (미비 항목이 없으면 scheduled, 있으면 draft) */
export async function autoDetermineStatus(db: Db, id: string): Promise<{ status: string; missing: string[] }> {
  const [post] = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, id)).limit(1);
  if (!post || post.status === 'published') {
    return { status: post?.status ?? 'published', missing: [] };
  }
  let event: typeof events.$inferSelect | null = null;
  if (post.eventId) {
    const [ev] = await db.select().from(events).where(eq(events.id, post.eventId)).limit(1);
    event = ev ?? null;
  }
  const rendered = await renderForPublish(db, post);
  const missing = computeMissing(post, event, rendered.unresolved);
  const nextStatus = missing.length === 0 ? 'scheduled' : 'draft';

  if (post.status !== nextStatus && post.status !== 'failed') {
    await db.update(scheduledPosts).set({ status: nextStatus, updatedAt: new Date() }).where(eq(scheduledPosts.id, id));
  }
  return { status: post.status === 'failed' ? 'failed' : nextStatus, missing };
}

/**
 * 예약 큐: 발행일 순.
 * - teamId 지정 시 해당 팀 소유만.
 * - actor 가 회장단·시스템관리자가 아니면 자기 소속 팀 예약 + 본인 개인 예약만(자기 팀만 관리 원칙).
 * - 회장단·시스템관리자(또는 actor 미지정)는 전체.
 */
export async function listReservations(db: Db, opts: { teamId?: string; actor?: Actor } = {}): Promise<ReservationRow[]> {
  let where: SQL | undefined = undefined;
  if (opts.actor && !isPrivileged(opts.actor.role)) {
    // 비회장단: 자기 소속 팀 예약 + 본인 개인 예약만(teamId 쿼리로 남의 팀을 볼 수 없게 무시).
    const teamIds = opts.actor.teams.map((t) => t.teamId);
    const conds = [and(eq(scheduledPosts.ownerType, 'personal'), eq(scheduledPosts.ownerId, opts.actor.userId))];
    if (teamIds.length) conds.push(and(eq(scheduledPosts.ownerType, 'team'), inArray(scheduledPosts.ownerId, teamIds)));
    where = or(...conds);
  } else if (opts.teamId) {
    where = and(eq(scheduledPosts.ownerType, 'team'), eq(scheduledPosts.ownerId, opts.teamId));
  }
  const rows = await db
    .select({ post: scheduledPosts, event: events, boardName: boards.name })
    .from(scheduledPosts)
    .leftJoin(events, eq(events.id, scheduledPosts.eventId))
    .leftJoin(boards, eq(boards.menuid, scheduledPosts.boardMenuid))
    .where(where)
    .orderBy(asc(scheduledPosts.publishAt));

  // 팀 소유 예약의 {{팀장단}}(자동+수동)을 팀별로 한 번씩 구성해 "발행 시 미치환 키"를 큐에서 바로 보여준다.
  const teamIds = [...new Set(rows.filter((r) => r.post.ownerType === 'team' && r.post.status !== 'published').map((r) => r.post.ownerId))];
  const leadersByTeam = new Map(await Promise.all(teamIds.map(async (id) => [id, await composeTeamLeaders(db, id)] as const)));

  return rows.map(({ post, event, boardName }) => {
    const placeholders =
      post.status === 'published'
        ? []
        : usedPlaceholders(post, publishVars(event, post.ownerType === 'team' ? (leadersByTeam.get(post.ownerId) ?? '') : ''));
    const unresolvedKeys = placeholders.filter((p) => p.value === null).map((p) => p.key);
    const missing = computeMissing(post, event, unresolvedKeys);
    const computedStatus =
      post.status === 'published' || post.status === 'failed'
        ? post.status
        : missing.length === 0
          ? 'scheduled'
          : 'draft';

    return {
      id: post.id,
      title: post.title,
      status: computedStatus,
      boardMenuid: post.boardMenuid,
      boardName: boardName ?? null,
      publishAt: post.publishAt ? post.publishAt.toISOString() : null,
      cafeArticleUrl: post.cafeArticleUrl,
      ownerType: post.ownerType,
      ownerId: post.ownerId,
      failReason: post.failReason ?? null,
      event: event
        ? { eventDate: event.eventDate, meetTime: event.meetTime, place: event.place, capacity: event.capacity }
        : null,
      missing,
      placeholders,
    };
  });
}
