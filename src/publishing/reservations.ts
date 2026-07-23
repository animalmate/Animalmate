// 예약(scheduled_post) 생성/조회 — 일반 공지(개인 소유) + 봉사 공지(팀 소유 + event 통합).
// 예약 큐 화면·작성 폼의 서버 진입점. 권한은 post.create(운영진 이상).

import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '@/db/types';
import { scheduledPosts, events } from '@/db/schema';
import type { Actor } from '@/auth/permissions';
import { requireAuthorized } from '@/auth/guard';
import { buildAuditEntry, recordAudit } from '@/auth/audit';

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
  requireAuthorized(actor, { kind: 'post.create' });

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

export interface ReservationRow {
  id: string;
  title: string;
  status: string;
  boardMenuid: number;
  publishAt: string | null;
  cafeArticleUrl: string | null;
  ownerType: string;
  ownerId: string;
  event: { eventDate: string | null; meetTime: string | null; place: string | null; capacity: number | null } | null;
  missing: string[]; // draft 일 때 부족한 필수 필드
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

/** 예약 큐: 발행일 순. teamId 지정 시 해당 팀 소유만. */
export async function listReservations(db: Db, opts: { teamId?: string } = {}): Promise<ReservationRow[]> {
  const rows = await db
    .select({ post: scheduledPosts, event: events })
    .from(scheduledPosts)
    .leftJoin(events, eq(events.id, scheduledPosts.eventId))
    .where(opts.teamId ? and(eq(scheduledPosts.ownerType, 'team'), eq(scheduledPosts.ownerId, opts.teamId)) : undefined)
    .orderBy(asc(scheduledPosts.publishAt));

  return rows.map(({ post, event }) => ({
    id: post.id,
    title: post.title,
    status: post.status,
    boardMenuid: post.boardMenuid,
    publishAt: post.publishAt ? post.publishAt.toISOString() : null,
    cafeArticleUrl: post.cafeArticleUrl,
    ownerType: post.ownerType,
    ownerId: post.ownerId,
    event: event
      ? { eventDate: event.eventDate, meetTime: event.meetTime, place: event.place, capacity: event.capacity }
      : null,
    missing: computeMissing(post, event),
  }));
}
