import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray, gte, and } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { scheduledPosts, boards, users, auditLogs } from '@/db/schema';
import { createDraft, markReady, schedulePost, getPost } from '@/publishing/scheduled-posts';
import { runPublishWorker } from '@/publishing/publish-worker';
import type { Actor } from '@/auth/permissions';
import type { CafeWriteResult } from '@/naver/cafe-write';

const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const suite = DIRECT_URL ? describe : describe.skip;

const MENUID = 990070;
const EMAIL = 'publish-worker-test@example.invalid';

suite('발행 워커 — dry-run 오케스트레이션 + 요약', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let staff: Actor;
  const postIds: string[] = [];
  let testStart: Date;

  async function makeDuePost(): Promise<string> {
    const past = new Date(Date.now() - 60_000);
    const draft = await createDraft(db, staff, {
      ownerType: 'personal',
      ownerId: staff.userId,
      boardMenuid: MENUID,
      title: '워커 테스트 공지',
      contentMd: '내용',
      publishAt: past,
    });
    postIds.push(draft.id);
    await markReady(db, staff, draft.id);
    await schedulePost(db, staff, draft.id);
    return draft.id;
  }

  async function cleanup() {
    if (postIds.length) await db.delete(auditLogs).where(inArray(auditLogs.targetId, postIds));
    await db.delete(scheduledPosts).where(eq(scheduledPosts.boardMenuid, MENUID));
    await db.delete(boards).where(eq(boards.menuid, MENUID));
    await db.delete(users).where(eq(users.email, EMAIL));
  }

  beforeAll(async () => {
    sql = postgres(DIRECT_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    testStart = new Date();
    await cleanup();
    await db.insert(boards).values({ menuid: MENUID, name: '워커 테스트', botCanWrite: true });
    const [u] = await db.insert(users).values({ email: EMAIL, name: '워커' }).returning();
    staff = { userId: u!.id, role: 'staff', membershipActive: true, teams: [] };
  });

  afterAll(async () => {
    // 테스트가 만든 cron.publish 요약 감사만 정리(관제 로그 보존 원칙 — 테스트 노이즈만 제거).
    await db
      .delete(auditLogs)
      .where(and(eq(auditLogs.action, 'cron.publish'), gte(auditLogs.createdAt, testStart)));
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  it('dry-run: due 게시물 발행 → published + 요약(dryRun=true, 실카페 미호출)', async () => {
    const id = await makeDuePost();
    const summary = await runPublishWorker(db, { dryRun: true, sleep: async () => {} });

    expect(summary.dryRun).toBe(true);
    expect(summary.processed).toBeGreaterThanOrEqual(1);
    expect(summary.published).toBeGreaterThanOrEqual(1);
    expect(summary.articleUrls.every((u) => u.startsWith('dry-run://'))).toBe(true);

    const post = await getPost(db, id);
    expect(post!.status).toBe('published');
    expect(post!.cafeArticleUrl).toContain('dry-run://');

    // 요약이 audit_logs(cron.publish, actor null)에 남는다 — 크론 관제 로그
    const audits = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, 'cron.publish'), gte(auditLogs.createdAt, testStart)));
    expect(audits.length).toBeGreaterThanOrEqual(1);
    expect(audits[0]!.actorUserId).toBeNull();
  });

  it('재시도 소진 후 실패(failed) → 운영진 알림 메일 발송(규칙 #5)', async () => {
    const id = await makeDuePost();
    // 재시도 2회(MAX) 소진 + 아주 오래된 발행시각(다른 테스트 due 글보다 먼저 처리되도록) → 이번 오류로 failed 확정.
    await db
      .update(scheduledPosts)
      .set({ retryCount: 2, publishAt: new Date(Date.now() - 30 * 86_400_000) })
      .where(eq(scheduledPosts.id, id));
    const errorRes: CafeWriteResult = {
      ok: false,
      status: 403,
      raw: { message: { error: { code: 'AP003', message: '카페스탭 등급 필요' } } },
    };
    const okRes: CafeWriteResult = { ok: true, status: 200, articleUrl: 'dry-run://ok', raw: {} };
    const sent: { to: string | string[]; subject: string }[] = [];
    // 오류는 내 예약에만 주입(병렬 테스트 예약 오염 방지 — 다른 due 글은 성공 처리).
    await runPublishWorker(db, {
      dryRun: true,
      sleep: async () => {},
      cafeWrite: async (post) => (post.id === id ? errorRes : okRes),
      alertEmails: async () => ['ops@example.invalid'],
      mailer: {
        send: async (m) => { sent.push({ to: m.to, subject: m.subject }); },
        sendOtp: async () => {},
      },
    });

    const post = await getPost(db, id);
    expect(post!.status).toBe('failed');
    // 내 실패 예약이 포함된 알림이 운영진에게 발송됨.
    const alert = sent.find((m) => (Array.isArray(m.to) ? m.to.includes('ops@example.invalid') : m.to === 'ops@example.invalid'));
    expect(alert).toBeDefined();
    expect(alert!.subject).toContain('발행 실패');
  });

  it('미치환 플레이스홀더가 남으면 게시하지 않고 failed 확정(blocked 집계)', async () => {
    const id = await makeDuePost();
    // ready 이후 값이 비워진 상황을 재현({{장소}} 를 채울 event 가 없는 개인 공지).
    await db
      .update(scheduledPosts)
      .set({ contentMd: '장소 {{장소}} 에서 만나요', publishAt: new Date(Date.now() - 30 * 86_400_000) })
      .where(eq(scheduledPosts.id, id));
    const okRes: CafeWriteResult = { ok: true, status: 200, articleUrl: 'dry-run://ok', raw: {} };
    const written: string[] = [];
    const summary = await runPublishWorker(db, {
      dryRun: true,
      sleep: async () => {},
      cafeWrite: async (post) => {
        written.push(post.id);
        return okRes;
      },
    });

    expect(summary.blocked).toBeGreaterThanOrEqual(1);
    expect(written).not.toContain(id); // 카페 쓰기 자체를 시도하지 않는다
    const post = await getPost(db, id);
    expect(post!.status).toBe('failed');
    expect(post!.failReason).toContain('{{장소}}');
  });

  it('code 999 주입 → failed 아님, scheduled 유지, 요약 waited 집계', async () => {
    const id = await makeDuePost();
    const rateLimited: CafeWriteResult = {
      ok: false,
      status: 403,
      raw: { message: { error: { code: '999', message: '게시글을 연속으로 등록할 수 없습니다.' } } },
    };
    const summary = await runPublishWorker(db, {
      dryRun: true,
      sleep: async () => {},
      cafeWrite: async () => rateLimited, // 이 사이클 모든 글에 999 반환
    });

    expect(summary.waited).toBeGreaterThanOrEqual(1);
    const post = await getPost(db, id);
    expect(post!.status).toBe('scheduled'); // failed 아님
    expect(post!.retryCount).toBe(0); // 대기 후 재시도(증가 없음)
  });
});
