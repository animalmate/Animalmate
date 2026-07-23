import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { scheduledPosts, boards, users, auditLogs } from '@/db/schema';
import {
  createDraft,
  markReady,
  schedulePost,
  fetchDuePosts,
  applyPublishResult,
  getPost,
  NotReadyError,
} from '@/publishing/scheduled-posts';
import { PermissionError } from '@/auth/guard';
import type { Actor } from '@/auth/permissions';

const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const suite = DIRECT_URL ? describe : describe.skip;

const MENUID = 990069;
const EMAIL = 'sched-posts-test@example.invalid';

suite('scheduled_posts 서비스 — 작성/상태머신/발행결과', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let staff: Actor;
  let member: Actor;
  const postIds: string[] = [];

  async function cleanup() {
    if (postIds.length) await db.delete(auditLogs).where(inArray(auditLogs.targetId, postIds));
    await db.delete(scheduledPosts).where(eq(scheduledPosts.boardMenuid, MENUID));
    await db.delete(boards).where(eq(boards.menuid, MENUID));
    await db.delete(users).where(eq(users.email, EMAIL));
  }

  beforeAll(async () => {
    sql = postgres(DIRECT_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup();
    await db.insert(boards).values({ menuid: MENUID, name: '예약글 테스트', botCanWrite: true });
    const [u] = await db.insert(users).values({ email: EMAIL, name: '예약자' }).returning();
    staff = { userId: u!.id, role: 'staff', membershipActive: true, teams: [] };
    member = { userId: u!.id, role: 'member', membershipActive: true, teams: [] };
  });

  afterAll(async () => {
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  function baseInput(publishAt: Date | null) {
    return {
      ownerType: 'personal' as const,
      ownerId: staff.userId,
      boardMenuid: MENUID,
      title: '봉사 공지',
      contentMd: '내용',
      publishAt,
    };
  }

  it('부원은 예약 글 생성 불가(PermissionError)', async () => {
    await expect(createDraft(db, member, baseInput(new Date()))).rejects.toBeInstanceOf(PermissionError);
  });

  it('필수값(발행시각) 없으면 markReady 가 NotReadyError', async () => {
    const draft = await createDraft(db, staff, baseInput(null));
    postIds.push(draft.id);
    expect(draft.status).toBe('draft');
    await expect(markReady(db, staff, draft.id)).rejects.toBeInstanceOf(NotReadyError);
  });

  it('draft → ready → scheduled 전이', async () => {
    const past = new Date(Date.now() - 60_000);
    const draft = await createDraft(db, staff, baseInput(past));
    postIds.push(draft.id);
    const ready = await markReady(db, staff, draft.id);
    expect(ready.status).toBe('ready');
    const scheduled = await schedulePost(db, staff, draft.id);
    expect(scheduled.status).toBe('scheduled');
  });

  it('fetchDuePosts 는 due(scheduled+publish_at<=now) 를 최대 5건 반환', async () => {
    const due = await fetchDuePosts(db, new Date(), 5);
    expect(due.length).toBeGreaterThanOrEqual(1);
    expect(due.length).toBeLessThanOrEqual(5);
    expect(due.every((p) => p.status === 'scheduled')).toBe(true);
  });

  it('rate_limited(code 999) 적용 → failed 아님, scheduled 유지, retry_count 불변', async () => {
    const past = new Date(Date.now() - 60_000);
    const d = await createDraft(db, staff, baseInput(past));
    postIds.push(d.id);
    await markReady(db, staff, d.id);
    const scheduled = await schedulePost(db, staff, d.id);

    const after = (await applyPublishResult(db, scheduled, { kind: 'rate_limited' }))!;
    expect(after.status).toBe('scheduled');
    expect(after.status).not.toBe('failed');
    expect(after.retryCount).toBe(0);
  });

  it('success 적용 → published + 카페 URL 저장', async () => {
    const past = new Date(Date.now() - 60_000);
    const d = await createDraft(db, staff, baseInput(past));
    postIds.push(d.id);
    await markReady(db, staff, d.id);
    const scheduled = await schedulePost(db, staff, d.id);

    const after = (await applyPublishResult(db, scheduled, {
      kind: 'success',
      articleUrl: 'https://cafe.naver.com/animalmate2010/99999',
    }))!;
    expect(after.status).toBe('published');
    expect(after.cafeArticleUrl).toBe('https://cafe.naver.com/animalmate2010/99999');

    // 발행 결과 audit(post.published, 시스템=actor null) 기록 확인
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.targetId, d.id));
    expect(audits.some((a) => a.action === 'post.published' && a.actorUserId === null)).toBe(true);
  });
});
