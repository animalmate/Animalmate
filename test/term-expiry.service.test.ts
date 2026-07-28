import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, like } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { users, memberships, auditLogs } from '@/db/schema';
import { expireLapsedMemberships } from '@/auth/term-expiry';
import type { Db } from '@/db/types';

const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const suite = DIRECT_URL ? describe : describe.skip;

// ⚠ expireLapsedMemberships 는 **범위 인자가 없다** — DB 전체에서 임기 지난 멤버십을 찾아 강등하고
// 세션을 끊는다. 통합 테스트는 운영 DB(DIRECT_URL)를 대상으로 돌기 때문에, 그대로 호출하면
// 실제 운영진이 로그아웃될 수 있다. 그래서 **전부 하나의 트랜잭션 안에서 돌리고 마지막에 롤백**한다.
// (함수 내부의 transaction 은 세이브포인트가 되므로 정상 동작한다.)
const ROLLBACK = new Error('__rollback__');

// 판정 기준일을 고정한다. 실행 시각에 따라 결과가 달라지면 테스트가 아니라 점괘가 된다.
// 15:00 UTC + 9h = 다음 날 00:00 KST → KST 기준 2026-09-01.
const NOW = new Date('2026-08-31T15:00:00Z');

suite('임기 자동 만료(expireLapsedMemberships)', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(() => {
    sql = postgres(DIRECT_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  it('임기 지난 것만 강등하고, 세션을 끊고, audit 을 남긴다 (전부 롤백)', async () => {
    await expect(
      db.transaction(async (tx) => {
        // 트랜잭션 핸들을 그대로 서비스에 넘긴다. Tx 와 Db 는 런타임 인터페이스가 같지만
        // 타입 별칭이 달라 캐스트가 필요하다(`any` 아님 — 이중 캐스트).
        const scoped = tx as unknown as Db;

        const mk = async (email: string, termEnd: string, status: 'active' | 'expired' = 'active') => {
          const [u] = await tx.insert(users).values({ email, name: email.split('@')[0]! }).returning();
          await tx
            .insert(memberships)
            .values({ userId: u!.id, role: 'staff', termStart: '2026-03-01', termEnd, status });
          return u!.id;
        };
        const statusOf = async (userId: string) => {
          const [row] = await tx
            .select({ status: memberships.status })
            .from(memberships)
            .where(eq(memberships.userId, userId));
          return row?.status;
        };
        const versionOf = async (userId: string) => {
          const [row] = await tx.select({ v: users.sessionVersion }).from(users).where(eq(users.id, userId));
          return row?.v;
        };

        const lapsed = await mk('term-expiry-lapsed@example.invalid', '2026-08-31'); // 하루 지남
        const lastDay = await mk('term-expiry-lastday@example.invalid', '2026-09-01'); // 오늘이 마지막 날
        const future = await mk('term-expiry-future@example.invalid', '2027-02-28'); // 한참 남음

        const beforeLastDay = await versionOf(lastDay);
        const beforeFuture = await versionOf(future);

        const summary = await expireLapsedMemberships(scoped, NOW);
        expect(summary.today).toBe('2026-09-01');
        expect(summary.expired).toBeGreaterThanOrEqual(1);

        // 만료 대상만 강등된다.
        expect(await statusOf(lapsed)).toBe('expired');
        // "8/31 까지"라고 했으면 8/31 하루는 쓸 수 있어야 한다.
        expect(await statusOf(lastDay)).toBe('active');
        expect(await statusOf(future)).toBe('active');

        // 만료된 사람의 세션만 끊는다(전원 로그아웃 사고 방지).
        expect(await versionOf(lapsed)).toBeGreaterThan(0);
        expect(await versionOf(lastDay)).toBe(beforeLastDay);
        expect(await versionOf(future)).toBe(beforeFuture);

        // 누가 왜 만료됐는지 사람 단위로 남는다(규칙 #4).
        const logs = await tx
          .select({ action: auditLogs.action, after: auditLogs.afterJson })
          .from(auditLogs)
          .where(and(eq(auditLogs.targetId, lapsed), like(auditLogs.action, 'membership.expire%')));
        expect(logs.length).toBe(1);
        expect(logs[0]!.action).toContain('[high]');
        expect(logs[0]!.after).toMatchObject({ status: 'expired', reason: 'term_end_passed' });

        // 두 번째 호출은 만료시킬 것이 없다 — 세션을 또 끊지 않는다(멱등).
        const v = await versionOf(lapsed);
        const again = await expireLapsedMemberships(scoped, NOW);
        expect(again.expired).toBe(0);
        expect(await versionOf(lapsed)).toBe(v);

        throw ROLLBACK; // 여기까지의 모든 변경을 되돌린다
      })
    ).rejects.toBe(ROLLBACK);

    // 롤백 확인 — 테스트 계정이 하나도 남지 않아야 한다.
    const leftovers = await db
      .select({ id: users.id })
      .from(users)
      .where(like(users.email, 'term-expiry-%@example.invalid'));
    expect(leftovers).toHaveLength(0);
  });
});
