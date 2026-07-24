// 예약(scheduled_post) 생성/조회 — 일반 공지(개인 소유) + 봉사 공지(팀 소유 + event 통합).
// 예약 큐 화면·작성 폼의 서버 진입점. 권한은 post.create(운영진 이상).

import { and, asc, eq, inArray, or, type SQL } from 'drizzle-orm';
import type { Db } from '@/db/types';
import { scheduledPosts, events, teams, boards } from '@/db/schema';
import { dateVars, leadersBlock, kstDateStr } from './placeholders';
import { isPrivileged, type Actor } from '@/auth/permissions';
import { requireAuthorized } from '@/auth/guard';
import { buildAuditEntry, recordAudit } from '@/auth/audit';
import { getTemplate, renderTemplate } from './post-templates';
import { publishVars, renderFinal } from './final-render';

export type ScheduledPost = typeof scheduledPosts.$inferSelect;

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

export async function createReservation(db: Db, actor: Actor, input: CreateReservationInput): Promise<ScheduledPost> {
  // 일반(개인) 공지 = post.create(운영진). 봉사(팀) 공지 = 팀 소유 스코프(팀장은 소속 팀만, 회장단 override).
  if (input.kind === 'volunteer') {
    requireAuthorized(actor, { kind: 'recurring.manage', owner: { ownerType: 'team', ownerId: input.teamId } });
  } else {
    requireAuthorized(actor, { kind: 'post.create' });
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
    return post!;
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
    return post!;
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
export async function createReservationsMulti(
  db: Db,
  actor: Actor,
  shared: SharedFields,
  occurrences: Occurrence[]
): Promise<string[]> {
  // 봉사 공지면 팀장단 명단을 한 번만 조회.
  let leaders = '';
  if (shared.kind === 'volunteer' && shared.teamId) {
    const [team] = await db.select({ leaders: teams.leaders }).from(teams).where(eq(teams.id, shared.teamId)).limit(1);
    leaders = leadersBlock(team?.leaders);
  }
  // 양식의 기본 장소·정원(장소별 양식). 없으면 null 로 두고 예약 수정에서 채운다.
  const template = shared.templateId ? await getTemplate(db, shared.templateId) : null;

  const ids: string[] = [];
  for (const occ of occurrences) {
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
  return ids;
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

/** 예약 개별 수정(published 전까지). 소유자/회장단. post + 연결 event 필드 갱신. */
export async function updateReservation(db: Db, actor: Actor, id: string, patch: UpdateReservationPatch): Promise<void> {
  const [post] = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, id)).limit(1);
  if (!post) throw new Error(`scheduled_post not found: ${id}`);
  requireAuthorized(actor, { kind: 'post.modify', owner: { ownerType: post.ownerType, ownerId: post.ownerId } });
  if (post.status === 'published') throw new Error('발행된 예약은 수정할 수 없습니다.');

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
  unresolved: string[]; // 발행 직전에도 채워지지 않는 플레이스홀더 키(발행 차단 대상)
}

function computeMissing(p: ScheduledPost, ev: typeof events.$inferSelect | null): string[] {
  if (p.status !== 'draft') return [];
  const m: string[] = [];
  if (!p.title?.trim()) m.push('제목');
  if (!p.contentMd?.trim()) m.push('본문');
  if (p.publishAt == null) m.push('발행시각');
  if (p.eventId && ev) {
    if (ev.eventDate == null) m.push('일시');
    if (!ev.place?.trim()) m.push('장소');
    if (ev.capacity == null) m.push('정원');
  }
  return m;
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
  // 팀장단 명단까지 조인해 "발행하면 실제로 어떤 키가 미치환으로 남는지"를 큐에서 바로 보여준다.
  const rows = await db
    .select({ post: scheduledPosts, event: events, leaders: teams.leaders, boardName: boards.name })
    .from(scheduledPosts)
    .leftJoin(events, eq(events.id, scheduledPosts.eventId))
    .leftJoin(teams, and(eq(scheduledPosts.ownerType, 'team'), eq(teams.id, scheduledPosts.ownerId)))
    .leftJoin(boards, eq(boards.menuid, scheduledPosts.boardMenuid))
    .where(where)
    .orderBy(asc(scheduledPosts.publishAt));

  return rows.map(({ post, event, leaders, boardName }) => ({
    id: post.id,
    title: post.title,
    status: post.status,
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
    missing: computeMissing(post, event),
    unresolved:
      post.status === 'published'
        ? [] // 이미 나간 글은 되돌릴 수 없다(카페 수정 API 없음) — 경고 대상 아님
        : renderFinal(post, publishVars(event, leadersBlock(leaders))).unresolved,
  }));
}
