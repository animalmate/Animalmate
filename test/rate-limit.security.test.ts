// 레이트 리밋 — 인증 전 엔드포인트(가입코드 대입·OTP 무차별 대입·메일 폭탄)의 방어선.
// 카운터가 DB 에 있으므로 실 DB 로 검증한다.

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, like } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { rateLimits } from '@/db/schema';
import { consumeRateLimit, resetRateLimit, pruneRateLimits, RateLimitError, type LimitRule } from '@/http/rate-limit';

const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const suite = DIRECT_URL ? describe : describe.skip;

const BUCKET = 'test_bucket';
const RULE: LimitRule = { bucket: BUCKET, windowSeconds: 60, max: 3 };
const IP = 'ratelimit-test-198.51.100.1';

suite('레이트 리밋 — 고정 윈도 카운터', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  const cleanup = () => db.delete(rateLimits).where(eq(rateLimits.bucket, BUCKET));

  beforeAll(async () => {
    sql = postgres(DIRECT_URL!, { prepare: false, max: 1 });
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
