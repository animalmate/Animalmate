// 레이트 리밋 — 인증 전 엔드포인트(가입코드 대입·OTP 무차별 대입·메일 폭탄)의 방어선.
// 카운터가 DB 에 있으므로 실 DB 로 검증한다.

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, like } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { rateLimits } from '@/db/schema';
import { consumeRateLimit, resetRateLimit, pruneRateLimits, RateLimitError, RULES, type LimitRule } from '@/http/rate-limit';
import { TEST_DATABASE_URL } from './db-url';

const suite = describe;

const BUCKET = 'test_bucket';
const RULE: LimitRule = { bucket: BUCKET, windowSeconds: 60, max: 3 };
const IP = 'ratelimit-test-198.51.100.1';

suite('레이트 리밋 — 고정 윈도 카운터', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  const cleanup = () => db.delete(rateLimits).where(eq(rateLimits.bucket, BUCKET));

  beforeAll(async () => {
    sql = postgres(TEST_DATABASE_URL, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await db.delete(rateLimits).where(like(rateLimits.identifier, 'ratelimit-test-%'));
    await sql.end({ timeout: 5 });
  });

  it('한도까지는 통과, 넘으면 429(RateLimitError)', async () => {
    const now = new Date('2026-08-01T10:00:00Z');
    for (let i = 0; i < RULE.max; i++) {
      await expect(consumeRateLimit(db, RULE, IP, now)).resolves.toBeUndefined();
    }
    await expect(consumeRateLimit(db, RULE, IP, now)).rejects.toBeInstanceOf(RateLimitError);
  });

  it('거부 응답은 언제 다시 시도할지 알려준다', async () => {
    const now = new Date('2026-08-01T10:00:30Z'); // 같은 윈도의 30초 지점
    try {
      await consumeRateLimit(db, RULE, IP, now);
      expect.unreachable('이미 한도를 넘긴 상태여야 한다');
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError);
      const retry = (e as RateLimitError).retryAfter;
      expect(retry).toBeGreaterThan(0);
      expect(retry).toBeLessThanOrEqual(RULE.windowSeconds);
    }
  });

  it('IP 가 다르면 서로 영향을 주지 않는다(옆 사람이 같이 막히지 않는다)', async () => {
    const now = new Date('2026-08-01T10:00:00Z');
    await expect(consumeRateLimit(db, RULE, 'ratelimit-test-다른IP', now)).resolves.toBeUndefined();
  });

  it('다음 윈도로 넘어가면 다시 열린다', async () => {
    const nextWindow = new Date('2026-08-01T10:01:00Z');
    await expect(consumeRateLimit(db, RULE, IP, nextWindow)).resolves.toBeUndefined();
  });

  it('동시 요청에서도 정확히 센다(원자적 UPSERT — 병렬로 상한을 뚫을 수 없다)', async () => {
    const now = new Date('2026-08-01T11:00:00Z');
    const id = 'ratelimit-test-동시';
    const rule: LimitRule = { bucket: BUCKET, windowSeconds: 60, max: 5 };
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => consumeRateLimit(db, rule, id, now))
    );
    const passed = results.filter((r) => r.status === 'fulfilled').length;
    expect(passed).toBe(rule.max); // 12개가 동시에 와도 통과는 정확히 5개
  });

  it('성공 로그인 후 초기화하면 실패 누적이 사라진다', async () => {
    const now = new Date('2026-08-01T12:00:00Z');
    const id = 'ratelimit-test-초기화';
    for (let i = 0; i < RULE.max; i++) await consumeRateLimit(db, RULE, id, now);
    await expect(consumeRateLimit(db, RULE, id, now)).rejects.toBeInstanceOf(RateLimitError);

    await resetRateLimit(db, RULE, id);
    await expect(consumeRateLimit(db, RULE, id, now)).resolves.toBeUndefined();
  });

  // ── 실사용 개시일 시나리오 ────────────────────────────────────────────
  // 운영진 30명이 한자리에 모여(같은 WiFi = 같은 공인 IP) 차례로 가입한다.
  // 여기서는 **실제 RULES 값**으로 돌린다 — 합성 규칙으로 검증하면 상한을 다시 낮췄을 때
  // 테스트가 그대로 통과해 버린다. 2026-07-31 QA 에서 실제로 막혀 있던 경로다(시간당 10).
  suite('공유 IP 뒤 단체 가입(실 RULES 값)', () => {
    const OFFICE_IP = 'ratelimit-test-동아리방';
    const HEADCOUNT = 30;
    const now = new Date('2026-08-01T19:00:00Z');

    it(`같은 IP 에서 ${HEADCOUNT}명이 연달아 가입 요청해도 아무도 막히지 않는다`, async () => {
      for (let i = 0; i < HEADCOUNT; i++) {
        await expect(consumeRateLimit(db, RULES.signupRequest, OFFICE_IP, now)).resolves.toBeUndefined();
      }
    });

    it(`같은 IP 에서 ${HEADCOUNT}명이 OTP 를 검증해도 아무도 막히지 않는다`, async () => {
      for (let i = 0; i < HEADCOUNT; i++) {
        await expect(consumeRateLimit(db, RULES.otpVerify, OFFICE_IP, now)).resolves.toBeUndefined();
      }
    });

    it('가입코드를 **맞게** 넣은 사람은 오답 버킷을 건드리지 않는다(몇 명이든 통과)', async () => {
      // 라우트는 오답일 때만 signupCodeFail 을 소비한다. 정답만 들어온 이 IP 의 통은 비어 있어야 한다.
      const [row] = await db
        .select({ count: rateLimits.count })
        .from(rateLimits)
        .where(and(eq(rateLimits.bucket, RULES.signupCodeFail.bucket), eq(rateLimits.identifier, OFFICE_IP)));
      expect(row).toBeUndefined();
    });

    it('가입코드 대입은 여전히 좁게 막힌다(오답 전용 버킷은 그대로 엄격)', async () => {
      const attacker = 'ratelimit-test-공격자';
      for (let i = 0; i < RULES.signupCodeFail.max; i++) {
        await expect(consumeRateLimit(db, RULES.signupCodeFail, attacker, now)).resolves.toBeUndefined();
      }
      // 정상 가입자가 아무리 많이 지나가도 이 상한은 열리지 않는다.
      await expect(consumeRateLimit(db, RULES.signupCodeFail, attacker, now)).rejects.toBeInstanceOf(RateLimitError);
    });

    it('OTP 무차별 대입은 주소 단위로 막힌다(IP 를 바꿔도 대상 주소로 묶인다)', async () => {
      const victim = 'ratelimit-test-victim@example.invalid';
      for (let i = 0; i < RULES.otpVerifyEmail.max; i++) {
        await consumeRateLimit(db, RULES.otpVerifyEmail, victim, now);
      }
      await expect(consumeRateLimit(db, RULES.otpVerifyEmail, victim, now)).rejects.toBeInstanceOf(RateLimitError);
    });

    // 정리는 이 테스트가 만든 식별자(ratelimit-test-*)로만 한정한다 —
    // 버킷 전체를 지우면 같은 DB 를 쓰는 다른 사람의 실제 카운터까지 날린다.
    afterAll(async () => {
      for (const r of [RULES.signupRequest, RULES.otpVerify, RULES.signupCodeFail, RULES.otpVerifyEmail]) {
        await db
          .delete(rateLimits)
          .where(and(eq(rateLimits.bucket, r.bucket), like(rateLimits.identifier, 'ratelimit-test-%')));
      }
    });
  });

  it('오래된 카운터는 정리되고 현재 윈도는 남는다', async () => {
    const old = new Date(Date.now() - 48 * 3600 * 1000);
    const nowId = 'ratelimit-test-현재';
    await consumeRateLimit(db, RULE, 'ratelimit-test-과거', old);
    await consumeRateLimit(db, RULE, nowId, new Date());

    await pruneRateLimits(db);

    const rows = await db.select({ identifier: rateLimits.identifier }).from(rateLimits).where(eq(rateLimits.bucket, BUCKET));
    const ids = rows.map((r) => r.identifier);
    expect(ids).not.toContain('ratelimit-test-과거');
    expect(ids).toContain(nowId);
  });
});
