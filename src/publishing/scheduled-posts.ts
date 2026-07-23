// scheduled_posts 서비스 — 예약 글 작성/상태 전이 + 발행 결과 적용.
// 상태머신(state-machine.ts)을 DB 에 반영한다. 사용자 행위는 권한+audit, 발행 워커 적용은 시스템(무액터).

import { and, asc, eq, lte } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { scheduledPosts, events } from '@/db/schema';
import type * as schema from '@/db/schema';
import type { Actor, Ownership } from '@/auth/permissions';
import { requireAuthorized } from '@/auth/guard';
import { buildAuditEntry, recordAudit } from '@/auth/audit';
import { assertTransition, nextStateForResult, type PublishResult } from './state-machine';

type DB = PostgresJsDatabase<typeof schema>;
export type ScheduledPost = typeof scheduledPosts.$inferSelect;

export interface CreatePostInput {
  ownerType: Ownership['ownerType'];
  ownerId: string;
  boardMenuid: number;
  eventId?: string | null; // 봉사 회차 연결(일반 공지는 null)
  title: string;
  contentMd: string;
  imageUrls?: string[] | null;
  publishAt?: Date | null;
}

function ownershipOf(post: ScheduledPost): Ownership {
  return { ownerType: post.ownerType, ownerId: post.ownerId };
}

export async function getPost(db: DB, id: string): Promise<ScheduledPost | null> {
  const [row] = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, id)).limit(1);
  return row ?? null;
}

/** 예약 글 초안 생성(운영진 이상). status='draft'. */
export async function createDraft(db: DB, actor: Actor, input: CreatePostInput): Promise<ScheduledPost> {
  requireAuthorized(actor, { kind: 'post.create' });
  const [row] = await db
    .insert(scheduledPosts)
    .values({
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      authorUserId: actor.userId,
      boardMenuid: input.boardMenuid,
      eventId: input.eventId ?? null,
      title: input.title,
      contentMd: input.contentMd,
      imageUrls: input.imageUrls ?? null,
      publishAt: input.publishAt ?? null,
      status: 'draft',
    })
    .returning();
  await recordAudit(
    db,
    buildAuditEntry({ actorUserId: actor.userId, action: 'post.create', targetTable: 'scheduled_posts', targetId: row!.id, after: row })
  );
  return row!;
}

export class NotReadyError extends Error {
  readonly status = 422;
  constructor(readonly missing: string[]) {
    super(`필수 필드 미완성: ${missing.join(', ')}`);
    this.name = 'NotReadyError';
  }
}

/**
 * draft → ready. 필수 필드 완성 검증 후 전이(소유자/회장단).
 * 봉사 회차(event_id) 연결 시 일시/장소/정원(event)도 필수. 봉사 외 일반 공지는 제목/본문/발행시각만.
 */
export async function markReady(db: DB, actor: Actor, id: string): Promise<ScheduledPost> {
  const post = await getPost(db, id);
  if (!post) throw new Error(`scheduled_post not found: ${id}`);
  requireAuthorized(actor, { kind: 'post.modify', owner: ownershipOf(post) });

  const missing: string[] = [];
  if (!post.title?.trim()) missing.push('title');
  if (!post.contentMd?.trim()) missing.push('content');
  if (post.boardMenuid == null) missing.push('board');
  if (post.publishAt == null) missing.push('publish_at');

  if (post.eventId) {
    const [ev] = await db.select().from(events).where(eq(events.id, post.eventId)).limit(1);
    if (!ev) missing.push('event');
    else {
      if (ev.eventDate == null) missing.push('event_date');
      if (!ev.place?.trim()) missing.push('place');
      if (ev.capacity == null) missing.push('capacity');
    }
  }
  if (missing.length) throw new NotReadyError(missing); // 빈 공지 발행 방지(안전장치)

  assertTransition(post.status, 'ready');
  return updateStatus(db, id, { status: 'ready' }, actor, 'post.ready', post);
}

/** 예약 취소 — published 전까지 소유자/회장단이 하드 삭제. 연결된 event 는 유지(팀장단이 별도 관리). */
export async function cancelPost(db: DB, actor: Actor, id: string): Promise<void> {
  const post = await getPost(db, id);
  if (!post) throw new Error(`scheduled_post not found: ${id}`);
  requireAuthorized(actor, { kind: 'post.modify', owner: ownershipOf(post) });
  if (post.status === 'published') throw new Error('이미 발행된 예약은 취소할 수 없습니다.');
  await db.delete(scheduledPosts).where(eq(scheduledPosts.id, id));
  await recordAudit(
    db,
    buildAuditEntry({ actorUserId: actor.userId, action: 'post.cancel', targetTable: 'scheduled_posts', targetId: id, before: { status: post.status, title: post.title } })
  );
}

/** ready → scheduled(발행 대기 큐 진입). */
export async function schedulePost(db: DB, actor: Actor, id: string): Promise<ScheduledPost> {
  const post = await getPost(db, id);
  if (!post) throw new Error(`scheduled_post not found: ${id}`);
  requireAuthorized(actor, { kind: 'post.modify', owner: ownershipOf(post) });
  assertTransition(post.status, 'scheduled');
  return updateStatus(db, id, { status: 'scheduled' }, actor, 'post.schedule', post);
}

/** 발행 대상(due) 조회: scheduled + publish_at <= now, 소량(≤limit). 발행 워커용. */
export async function fetchDuePosts(db: DB, now: Date, limit = 5): Promise<ScheduledPost[]> {
  return db
    .select()
    .from(scheduledPosts)
    .where(and(eq(scheduledPosts.status, 'scheduled'), lte(scheduledPosts.publishAt, now)))
    .orderBy(asc(scheduledPosts.publishAt))
    .limit(Math.min(limit, 5)); // 함수 타임아웃 방지: 한 사이클 최대 5건(02-TECH-STACK §3)
}

/**
 * 발행 시도 결과를 상태머신에 따라 반영한다(시스템/무액터 — 발행 워커가 호출).
 * code 999(rate_limited)는 failed 로 가지 않고 scheduled 유지(대기 후 재시도).
 */
export async function applyPublishResult(
  db: DB,
  post: ScheduledPost,
  result: PublishResult
): Promise<ScheduledPost | null> {
  const patch = nextStateForResult({ status: post.status, retryCount: post.retryCount }, result);
  const [row] = await db
    .update(scheduledPosts)
    .set({
      status: patch.status,
      retryCount: patch.retryCount,
      ...(patch.cafeArticleUrl !== undefined ? { cafeArticleUrl: patch.cafeArticleUrl } : {}),
      ...(patch.failReason !== undefined ? { failReason: patch.failReason } : {}),
      updatedAt: new Date(),
    })
    .where(eq(scheduledPosts.id, post.id))
    .returning();

  // 사이클 도중 예약이 취소(삭제)되면 갱신 대상이 없다 — 조용히 건너뛴다(워커 크래시 방지).
  if (!row) return null;

  const action =
    patch.status === 'published'
      ? 'post.published'
      : patch.status === 'failed'
        ? 'post.failed'
        : patch.waitAndRetry
          ? 'post.rate_limited'
          : 'post.retry';
  await recordAudit(
    db,
    buildAuditEntry({
      actorUserId: null, // 시스템(발행 워커)
      action,
      targetTable: 'scheduled_posts',
      targetId: post.id,
      before: { status: post.status, retryCount: post.retryCount },
      after: { status: patch.status, retryCount: patch.retryCount, cafeArticleUrl: patch.cafeArticleUrl },
    })
  );
  return row;
}

async function updateStatus(
  db: DB,
  id: string,
  set: { status: ScheduledPost['status'] },
  actor: Actor,
  action: string,
  before: ScheduledPost
): Promise<ScheduledPost> {
  const [row] = await db
    .update(scheduledPosts)
    .set({ status: set.status, updatedAt: new Date() })
    .where(eq(scheduledPosts.id, id))
    .returning();
  await recordAudit(
    db,
    buildAuditEntry({
      actorUserId: actor.userId,
      action,
      targetTable: 'scheduled_posts',
      targetId: id,
      before: { status: before.status },
      after: { status: set.status },
    })
  );
  return row!;
}
