import 'dotenv/config';
import { TEST_DATABASE_URL } from './db-url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { scheduledPosts, boards, users, auditLogs } from '@/db/schema';
import {
  createDraft,
  claimDuePosts,
  PUBLISH_LEASE_MS,
  applyPublishResult,
} from '@/publishing/scheduled-posts';
import { autoDetermineStatus } from '@/publishing/reservations';
import { PermissionError } from '@/auth/guard';
import type { Actor } from '@/auth/permissions';

const suite = describe;

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
    sql = postgres(TEST_DATABASE_URL, { prepare: false, max: 1 });
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

  /**
   * 점유 테스트는 "이 글이 잡히는가"를 봐야 하는데, 앞선 테스트가 남긴 due 글이 5건 한도를
   * 채우면 새 글이 밀려 잡히지 않는다. 대상 글만 남기고 나머지는 후보에서 빼둔다.
   */
  async function onlyDuePost(id: string) {
    await db.update(scheduledPosts).set({ status: 'draft' }).where(eq(scheduledPosts.boardMenuid, MENUID));
    await db.update(scheduledPosts).set({ status: 'scheduled' }).where(eq(scheduledPosts.id, id));
  }

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

  it('필수값(발행시각) 없으면 draft 상태로 유지', async () => {
    const draft = await createDraft(db, staff, baseInput(null));
    postIds.push(draft.id);
    expect(draft.status).toBe('draft');
  });

  // 상태 자동 판정은 createDraft(저수준 생성)가 아니라 autoDetermineStatus 가 담당한다
  // (커밋 64250a7 에서 '완성 처리' 수동 버튼을 없애며 예약 저장·수정 경로로 옮겼다).
  // createDraft 는 항상 draft 로 만들고, 저장 직후 이 함수가 미비 항목 유무로 상태를 정한다.
  it('필수값 완성 시 자동 scheduled 상태 적용', async () => {
    const past = new Date(Date.now() - 60_000);
    const post = await createDraft(db, staff, baseInput(past));
    postIds.push(post.id);
    expect(post.status).toBe('draft');

    const decided = await autoDetermineStatus(db, post.id);
    expect(decided.missing).toEqual([]);
    expect(decided.status).toBe('scheduled');
  });

  it('필수값이 비면 자동 판정이 draft 로 되돌린다', async () => {
    const draft = await createDraft(db, staff, baseInput(null));
    postIds.push(draft.id);

    const decided = await autoDetermineStatus(db, draft.id);
    expect(decided.status).toBe('draft');
    expect(decided.missing).toContain('업로드 시각');
  });

  it('claimDuePosts 는 due 를 최대 5건 점유해 publishing 으로 바꿔 반환', async () => {
    // 앞선 테스트가 남긴 상태에 기대지 않고 이 테스트가 쓸 글을 직접 만든다.
    const post = await createDraft(db, staff, baseInput(new Date(Date.now() - 60_000)));
    postIds.push(post.id);
    await onlyDuePost(post.id);

    const due = await claimDuePosts(db, new Date(), 5);
    expect(due.length).toBeGreaterThanOrEqual(1);
    expect(due.length).toBeLessThanOrEqual(5);
    expect(due.every((p) => p.status === 'publishing')).toBe(true);
  });

  // 크론이 매분 도는데 한 사이클은 건당 30초다(5건 = 2분). 예전에는 목록만 SELECT 하고
  // 카페 쓰기가 끝난 뒤에 상태를 바꿔서, 그 사이 시작된 워커가 같은 글을 다시 집어 갔다.
  // 카페는 삭제 API 가 없어 중복 게시를 되돌릴 수 없다.
  it('워커 두 개가 동시에 돌아도 같은 글을 두 번 집어 가지 않는다', async () => {
    const past = new Date(Date.now() - 60_000);
    const a = await createDraft(db, staff, baseInput(past));
    const b = await createDraft(db, staff, baseInput(past));
    postIds.push(a.id, b.id);

    const [first, second] = await Promise.all([
      claimDuePosts(db, new Date(), 5),
      claimDuePosts(db, new Date(), 5),
    ]);

    const firstIds = new Set(first.map((p) => p.id));
    const overlap = second.filter((p) => firstIds.has(p.id));
    expect(overlap).toEqual([]);
  });

  it('이미 점유된 글은 다시 점유되지 않는다', async () => {
    const past = new Date(Date.now() - 60_000);
    const post = await createDraft(db, staff, baseInput(past));
    postIds.push(post.id);

    await onlyDuePost(post.id);
    const firstIds = new Set((await claimDuePosts(db, new Date(), 5)).map((p) => p.id));
    expect(firstIds.has(post.id)).toBe(true);

    const again = await claimDuePosts(db, new Date(), 5);
    expect(again.map((p) => p.id)).not.toContain(post.id);
  });

  it('점유한 채 죽은 워커의 글은 임차 만료 후 회수된다', async () => {
    const past = new Date(Date.now() - 60_000);
    const post = await createDraft(db, staff, baseInput(past));
    postIds.push(post.id);

    await onlyDuePost(post.id);
    // 워커가 집어 간 뒤 죽은 상황: publishing 인데 updated_at 이 임차 시간보다 오래됐다.
    await db
      .update(scheduledPosts)
      .set({ status: 'publishing', updatedAt: new Date(Date.now() - PUBLISH_LEASE_MS - 60_000) })
      .where(eq(scheduledPosts.id, post.id));

    const reclaimed = await claimDuePosts(db, new Date(), 5);
    expect(reclaimed.map((p) => p.id)).toContain(post.id);
  });

  it('rate_limited(code 999) 적용 → failed 아님, scheduled 로 되돌아가 재시도, retry_count 불변', async () => {
    const past = new Date(Date.now() - 60_000);
    const scheduled = await createDraft(db, staff, baseInput(past));
    postIds.push(scheduled.id);
    await onlyDuePost(scheduled.id);
    const claimed = (await claimDuePosts(db, new Date(), 5)).find((p) => p.id === scheduled.id)!;

    const after = (await applyPublishResult(db, claimed, { kind: 'rate_limited' }))!;
    expect(after.status).toBe('scheduled');
    expect(after.status).not.toBe('failed');
    expect(after.retryCount).toBe(0);
  });

  it('success 적용 → published + 카페 URL 저장', async () => {
    const past = new Date(Date.now() - 60_000);
    const scheduled = await createDraft(db, staff, baseInput(past));
    postIds.push(scheduled.id);
    await onlyDuePost(scheduled.id);
    const claimed = (await claimDuePosts(db, new Date(), 5)).find((p) => p.id === scheduled.id)!;

    const after = (await applyPublishResult(db, claimed, {
      kind: 'success',
      articleUrl: 'https://cafe.naver.com/animalmate2010/99999',
    }))!;
    expect(after.status).toBe('published');
    expect(after.cafeArticleUrl).toBe('https://cafe.naver.com/animalmate2010/99999');

    // 발행 결과 audit(post.published, 시스템=actor null) 기록 확인
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.targetId, scheduled.id));
    expect(audits.some((a) => a.action === 'post.published' && a.actorUserId === null)).toBe(true);
  });

  it('임차가 만료돼 회수된 뒤 뒤늦게 끝난 워커는 결과를 덮어쓰지 못한다', async () => {
    const past = new Date(Date.now() - 60_000);
    const post = await createDraft(db, staff, baseInput(past));
    postIds.push(post.id);
    await onlyDuePost(post.id);
    const claimed = (await claimDuePosts(db, new Date(), 5)).find((p) => p.id === post.id)!;

    // 다른 워커가 회수해 이미 발행을 마친 상태.
    await applyPublishResult(db, claimed, { kind: 'success', articleUrl: 'https://cafe.naver.com/x/1' });

    // 뒤늦게 끝난 워커가 자기 결과를 반영하려 해도 걸러져야 한다.
    const late = await applyPublishResult(db, claimed, { kind: 'error', reason: '늦은 실패' });
    expect(late).toBeNull();

    const [row] = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, post.id));
    expect(row!.status).toBe('published');
  });
});
