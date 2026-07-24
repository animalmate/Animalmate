// 게시판 게이트 — "봇이 써도 되는 게시판"에만 글이 나가는지 검증한다.
//
// 배경: boardMenuid 는 예약 생성 요청 본문에서 온다. FK 덕에 "등록된 게시판"까지는 강제되지만,
// 그 전에는 is_active / bot_can_write 를 아무도 보지 않았다. 즉 운영진 계정 하나만 있으면
// 봇이 쓰면 안 되는 게시판으로도 예약을 만들 수 있었고, 카페는 삭제 API 가 없어 되돌릴 수 없다.
// 생성 시점과 발행 직전 두 곳 모두 막는지 확인한다.

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray, and, gte } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { scheduledPosts, boards, users, auditLogs } from '@/db/schema';
import { createReservation, BoardNotWritableError } from '@/publishing/reservations';
import { createDraft, markReady, schedulePost, getPost } from '@/publishing/scheduled-posts';
import { runPublishWorker } from '@/publishing/publish-worker';
import type { Actor } from '@/auth/permissions';

const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const suite = DIRECT_URL ? describe : describe.skip;

const OK_MENUID = 990090; // 활성 + 봇 쓰기 허용
const NO_BOT_MENUID = 990091; // 등록됐지만 봇 쓰기 불가
const INACTIVE_MENUID = 990092; // 폐지(비활성)
const UNREGISTERED_MENUID = 990093; // 레지스트리에 아예 없음
const ALL_MENUIDS = [OK_MENUID, NO_BOT_MENUID, INACTIVE_MENUID, UNREGISTERED_MENUID];
const EMAIL = 'board-gate-test@example.invalid';

// 실패 알림이 진짜 회장단 메일로 나가지 않게 워커 호출마다 넣는다(2026-07-24 사고 재발 방지).
const NO_REAL_MAIL = {
  alertEmails: async () => ['ops@example.invalid'],
  mailer: { send: async () => {}, sendOtp: async () => {} },
} as const;

suite('게시판 게이트 — 봇 쓰기가 허용된 게시판에만 예약·발행된다', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let staff: Actor;
  let testStart: Date;
  const postIds: string[] = [];

  async function cleanup() {
    if (postIds.length) await db.delete(auditLogs).where(inArray(auditLogs.targetId, postIds));
    await db.delete(scheduledPosts).where(inArray(scheduledPosts.boardMenuid, ALL_MENUIDS));
    await db.delete(boards).where(inArray(boards.menuid, ALL_MENUIDS));
    await db.delete(users).where(eq(users.email, EMAIL));
  }

  beforeAll(async () => {
    sql = postgres(DIRECT_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    testStart = new Date();
    await cleanup();
    await db.insert(boards).values([
      { menuid: OK_MENUID, name: '게이트 통과', botCanWrite: true, isActive: true },
      { menuid: NO_BOT_MENUID, name: '봇 쓰기 불가', botCanWrite: false, isActive: true },
      { menuid: INACTIVE_MENUID, name: '폐지된 게시판', botCanWrite: true, isActive: false },
    ]);
    const [u] = await db.insert(users).values({ email: EMAIL, name: '게이트' }).returning();
    staff = { userId: u!.id, role: 'staff', membershipActive: true, teams: [] };
  });

  afterAll(async () => {
    await db
      .delete(auditLogs)
      .where(and(eq(auditLogs.action, 'cron.publish'), gte(auditLogs.createdAt, testStart)));
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  const makeGeneral = (menuid: number) =>
    createReservation(db, staff, {
      kind: 'general',
      boardMenuid: menuid,
      title: '게이트 테스트',
      contentMd: '내용',
      publishAt: new Date(Date.now() + 3_600_000),
    });

  it('허용된 게시판이면 생성된다(정상 경로)', async () => {
    const post = await makeGeneral(OK_MENUID);
    postIds.push(post.id);
    expect(post.boardMenuid).toBe(OK_MENUID);
  });

  it('bot_can_write=false 게시판으로는 예약을 만들 수 없다', async () => {
    await expect(makeGeneral(NO_BOT_MENUID)).rejects.toBeInstanceOf(BoardNotWritableError);
  });

  it('비활성(폐지) 게시판으로도 만들 수 없다', async () => {
    await expect(makeGeneral(INACTIVE_MENUID)).rejects.toBeInstanceOf(BoardNotWritableError);
  });

  it('레지스트리에 없는 menuid 는 FK 이전에 게이트에서 걸린다', async () => {
    await expect(makeGeneral(UNREGISTERED_MENUID)).rejects.toBeInstanceOf(BoardNotWritableError);
  });

  it('거부된 시도는 예약을 하나도 남기지 않는다', async () => {
    const rows = await db
      .select({ id: scheduledPosts.id })
      .from(scheduledPosts)
      .where(inArray(scheduledPosts.boardMenuid, [NO_BOT_MENUID, INACTIVE_MENUID, UNREGISTERED_MENUID]));
    expect(rows).toHaveLength(0);
  });

  it('예약 후 게시판 권한이 회수되면 발행하지 않고 failed 로 막는다(마지막 방어선)', async () => {
    // 허용 상태에서 발행 대기까지 올려 둔다.
    const draft = await createDraft(db, staff, {
      ownerType: 'personal',
      ownerId: staff.userId,
      boardMenuid: OK_MENUID,
      title: '권한 회수 테스트',
      contentMd: '내용',
      publishAt: new Date(Date.now() - 60_000), // 이미 due
    });
    postIds.push(draft.id);
    await markReady(db, staff, draft.id);
    await schedulePost(db, staff, draft.id);

    // 그 뒤 회장단이 봇 쓰기를 끈다.
    await db.update(boards).set({ botCanWrite: false }).where(eq(boards.menuid, OK_MENUID));

    let wrote = false;
    const summary = await runPublishWorker(db, {
      dryRun: true,
      sleep: async () => {},
      cafeWrite: async () => {
        wrote = true; // 게이트가 동작하면 여기까지 오면 안 된다
        return { ok: true, status: 200, articleUrl: 'x', raw: {} };
      },
      ...NO_REAL_MAIL,
    });

    expect(wrote).toBe(false); // 카페 쓰기 자체를 시도하지 않았다
    expect(summary.blocked).toBeGreaterThanOrEqual(1);
    expect(summary.published).toBe(0);

    const after = await getPost(db, draft.id);
    expect(after?.status).toBe('failed');
    expect(after?.failReason).toContain('쓸 수 없는 게시판');

    await db.update(boards).set({ botCanWrite: true }).where(eq(boards.menuid, OK_MENUID));
  });
});
