import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, like } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { users, memberships, auditLogs } from '@/db/schema';
import { expireInactiveMemberships } from '@/auth/inactivity-expiry';
import { loadActor, LAST_SEEN_TOUCH_INTERVAL_MS } from '@/auth/auth-service';
import type { Db } from '@/db/types';
import { TEST_DATABASE_URL } from './db-url';

const suite = describe;

// ⚠ expireInactiveMemberships 는 **범위 인자가 없다** — DB 전체에서 오래 미접속 멤버십을 찾아
// 강등하고 세션을 끊는다. 그대로 호출하면 다른 테스트 파일이 만들어 둔 멤버십까지 싹 강등시킨다.
// 그래서 **전부 하나의 트랜잭션 안에서 돌리고 마지막에 롤백**한다.
// (함수 내부의 transaction 은 세이브포인트가 되므로 정상 동작한다.)
const ROLLBACK = new Error('__rollback__');

const NOW = new Date('2027-07-31T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

// 역할은 전부 staff 로 만든다 — board/sysadmin 을 쓰면 "마지막 권한자 보호"가 개입해서
// 이 DB 에 실제 권한자가 몇 명이냐에 따라 결과가 달라진다(전역 상태 의존).
// 그 규칙은 순수 함수 wouldOrphanConsole 의 단위 테스트로 따로 고정한다.
suite('미접속 자동 만료(expireInactiveMemberships)', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(() => {
    sql = postgres(TEST_DATABASE_URL, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  it('오래 안 들어온 계정만 강등하고, 세션을 끊고, audit 을 남긴다 (전부 롤백)', async () => {
    await expect(
      db.transaction(async (tx) => {
        const scoped = tx as unknown as Db;

        const mk = async (email: string, lastSeenAt: Date | null, createdAt: Date) => {
          const [u] = await tx
            .insert(users)
            .values({ email, name: email.split('@')[0]!, lastSeenAt, createdAt })
            .returning();
          await tx
            .insert(memberships)
            .values({ userId: u!.id, role: 'staff', termStart: '2026-03-01', termEnd: '2027-12-31', status: 'active' });
          return u!.id;
        };
        const statusOf = async (userId: string) => {
          const [row] = await tx.select({ status: memberships.status }).from(memberships).where(eq(memberships.userId, userId));
          return row?.status;
        };
        const versionOf = async (userId: string) => {
          const [row] = await tx.select({ v: users.sessionVersion }).from(users).where(eq(users.id, userId));
          return row?.v;
        };

        const stale = await mk('inactive-stale@example.invalid', daysAgo(400), daysAgo(800));
        const boundary = await mk('inactive-boundary@example.invalid', daysAgo(365), daysAgo(800)); // 딱 1년 — 아직 아님
        const fresh = await mk('inactive-fresh@example.invalid', daysAgo(3), daysAgo(800));
        // 한 번도 안 들어온 계정 — 가입 시각으로 판단한다.
        const neverSeenOld = await mk('inactive-never-old@example.invalid', null, daysAgo(400));
        const neverSeenNew = await mk('inactive-never-new@example.invalid', null, daysAgo(30));

        const beforeFresh = await versionOf(fresh);
        const beforeBoundary = await versionOf(boundary);

        const summary = await expireInactiveMemberships(scoped, { now: NOW });
        expect(summary.limitDays).toBe(365);
        expect(summary.expired).toBeGreaterThanOrEqual(2);

        // 오래 안 들어온 것만 내려간다.
        expect(await statusOf(stale)).toBe('expired');
        expect(await statusOf(neverSeenOld)).toBe('expired');
        // 딱 1년째는 아직 유효 — 경계에서 하루 일찍 뺏지 않는다.
        expect(await statusOf(boundary)).toBe('active');
        expect(await statusOf(fresh)).toBe('active');
        expect(await statusOf(neverSeenNew)).toBe('active');

        // 만료된 사람의 세션만 끊는다(전원 로그아웃 사고 방지).
        expect(await versionOf(stale)).toBeGreaterThan(0);
        expect(await versionOf(fresh)).toBe(beforeFresh);
        expect(await versionOf(boundary)).toBe(beforeBoundary);

        // 누가 왜 만료됐는지 사람 단위로 남는다(규칙 #4).
        const logs = await tx
          .select({ action: auditLogs.action, after: auditLogs.afterJson })
          .from(auditLogs)
          .where(and(eq(auditLogs.targetId, stale), like(auditLogs.action, 'membership.expire%')));
        expect(logs.length).toBe(1);
        expect(logs[0]!.action).toContain('[high]');
        expect(logs[0]!.after).toMatchObject({ status: 'expired', reason: 'inactive' });

        // 두 번째 호출은 만료시킬 것이 없다 — 세션을 또 끊지 않는다(멱등).
        const v = await versionOf(stale);
        const again = await expireInactiveMemberships(scoped, { now: NOW });
        expect(again.expired).toBe(0);
        expect(await versionOf(stale)).toBe(v);

        throw ROLLBACK; // 여기까지의 모든 변경을 되돌린다
      })
    ).rejects.toBe(ROLLBACK);

    // 롤백 확인 — 테스트 계정이 하나도 남지 않아야 한다.
    const leftovers = await db
      .select({ id: users.id })
      .from(users)
      .where(like(users.email, 'inactive-%@example.invalid'));
    expect(leftovers).toHaveLength(0);
  });

  // ⚠ 이 테스트가 **이 기능 전체의 생명줄**이다.
  // loadActor 의 갱신 실패는 일부러 삼킨다(활동 기록 때문에 로그인이 막히면 안 되므로).
  // 그래서 갱신이 조용히 안 되고 있어도 아무 증상이 없다가, **1년 뒤 전원이 만료된다.**
  // 실제로 써지는지를 여기서 못 박는다.
  //
  it('loadActor 가 last_seen_at 을 갱신한다 — 하루 지났을 때만 (전부 롤백)', async () => {
    await expect(
      db.transaction(async (tx) => {
        const scoped = tx as unknown as Db;
        const long = new Date(Date.now() - LAST_SEEN_TOUCH_INTERVAL_MS - 60_000); // 하루하고 1분 전

        const [stale] = await tx
          .insert(users)
          .values({ email: 'inactive-touch@example.invalid', name: '갱신대상', lastSeenAt: long })
          .returning();
        const [fresh] = await tx
          .insert(users)
          .values({ email: 'inactive-nottouch@example.invalid', name: '최근', lastSeenAt: new Date() })
          .returning();
        const freshBefore = fresh!.lastSeenAt!;

        const seenOf = async (id: string) => {
          const [r] = await tx.select({ v: users.lastSeenAt }).from(users).where(eq(users.id, id));
          return r?.v ?? null;
        };

        expect(await loadActor(scoped, stale!.id)).not.toBeNull();
        // 하루가 지났으면 갱신된다.
        expect((await seenOf(stale!.id))!.getTime()).toBeGreaterThan(long.getTime());

        // 하루가 안 지났으면 쓰지 않는다 — 매 요청 UPDATE 를 얹지 않기 위한 조건이다.
        await loadActor(scoped, fresh!.id);
        expect((await seenOf(fresh!.id))!.getTime()).toBe(freshBefore.getTime());

        throw ROLLBACK;
      })
    ).rejects.toBe(ROLLBACK);
  });
});
