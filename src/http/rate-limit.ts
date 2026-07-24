// 레이트 리밋 — 인증 전 엔드포인트(가입/로그인)의 무제한 시도를 막는다.
//
// 막으려는 것:
//  1. 가입코드 오라클 — /api/auth/signup/request 는 가입코드를 먼저 검사하므로, 틀리면 403,
//     맞으면 200/409 로 갈린다. 제한이 없으면 코드를 무제한으로 대입해 볼 수 있다.
//  2. OTP 무차별 대입 — 코드당 5회 제한이 있지만, 60초마다 새 코드를 받으면 시도를 계속 이어갈 수 있다.
//     이메일이 여러 개면 이메일별 쿨다운도 우회된다. IP 단위 상한이 있어야 한다.
//  3. 메일 폭탄 — 남의 이메일로 인증 메일을 반복 발송시키는 괴롭힘.
//  4. 비인증 요청이 매번 DB 를 때리는 것(무료 티어 소진).
//
// 고정 윈도(fixed window) 방식: 경계에서 최대 2배까지 통과할 수 있지만, 여기서 필요한 것은
// 정밀한 셰이핑이 아니라 자동화 차단이므로 충분하다. 카운터는 DB 에 둔다 — 서버리스는
// 인스턴스가 요청마다 바뀔 수 있어 메모리 카운터가 사실상 무력하기 때문.

import { and, eq, lt, sql } from 'drizzle-orm';
import { rateLimits } from '@/db/schema';
import type { Db, Database } from '@/db/types';

export class RateLimitError extends Error {
  readonly status = 429;
  constructor(readonly retryAfter: number) {
    super(`rate limited, retry after ${retryAfter}s`);
    this.name = 'RateLimitError';
  }
}

export interface LimitRule {
  /** 보호 대상 이름(버킷). 엔드포인트별로 다르게 준다. */
  bucket: string;
  /** 윈도 길이(초). */
  windowSeconds: number;
  /** 윈도 안에서 허용할 최대 횟수. */
  max: number;
}

/**
 * 이 서비스가 쓰는 규칙.
 * 300명 규모 동아리에서 사람이 정상적으로 쓰는 빈도와는 자릿수가 다르게 잡았다 —
 * 정상 사용자는 걸리지 않고 자동화만 걸리는 지점.
 */
export const RULES = {
  /** 가입 요청(가입코드 검사 포함) — 코드 대입과 메일 폭탄을 함께 막는 지점. */
  signupRequest: { bucket: 'signup_request', windowSeconds: 3600, max: 10 },
  /** 로그인 요청(OTP 발송). */
  loginRequest: { bucket: 'login_request', windowSeconds: 3600, max: 10 },
  /** OTP 검증(가입·로그인 공통) — 코드 무차별 대입 방어. */
  otpVerify: { bucket: 'otp_verify', windowSeconds: 3600, max: 20 },
} as const satisfies Record<string, LimitRule>;

/** 고정 윈도의 시작 시각(윈도 길이로 내림). */
function windowStartOf(now: Date, windowSeconds: number): Date {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

/**
 * 1회 소비하고 한도 초과면 RateLimitError(429). 원자적 UPSERT 라 동시 요청에도 정확하다.
 * 호출 자체가 실패하면(예: DB 순단) 요청을 막지 않는다 — 리밋은 보조 방어선이고,
 * 이것 때문에 로그인 전체가 멈추는 편이 더 나쁘다.
 */
export async function consumeRateLimit(
  db: Db,
  rule: LimitRule,
  identifier: string,
  now: Date = new Date()
): Promise<void> {
  const windowStart = windowStartOf(now, rule.windowSeconds);
  let count: number;
  try {
    const [row] = await db
      .insert(rateLimits)
      .values({ bucket: rule.bucket, identifier, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimits.bucket, rateLimits.identifier, rateLimits.windowStart],
        set: { count: sql`${rateLimits.count} + 1` },
      })
      .returning({ count: rateLimits.count });
    count = row?.count ?? 1;
  } catch (e) {
    console.error('[rate-limit] 카운터 갱신 실패 — 이번 요청은 통과시킨다', e);
    return;
  }

  if (count > rule.max) {
    const resetAt = windowStart.getTime() + rule.windowSeconds * 1000;
    throw new RateLimitError(Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000)));
  }
}

/** 지난 윈도 행 정리(일일 크론). 지금 윈도는 건드리지 않는다. */
export async function pruneRateLimits(db: Database, now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - 24 * 3600 * 1000);
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, cutoff));
}

/** 특정 주체의 카운터를 지운다(로그인 성공 시 그 IP 의 검증 실패 누적을 되돌리는 용도). */
export async function resetRateLimit(db: Database, rule: LimitRule, identifier: string): Promise<void> {
  try {
    await db
      .delete(rateLimits)
      .where(and(eq(rateLimits.bucket, rule.bucket), eq(rateLimits.identifier, identifier)));
  } catch (e) {
    console.error('[rate-limit] 카운터 초기화 실패', e);
  }
}

/**
 * 요청자 IP. Vercel 이 직접 넣는 헤더를 먼저 본다 —
 * `x-forwarded-for` 는 클라이언트가 위조해 보낼 수 있어 단독으로는 신뢰하지 않는다.
 * 아무 것도 없으면 'unknown' 으로 묶는다(로컬 개발 등. 묶여도 리밋은 동작한다).
 */
export function clientIp(headers: Headers): string {
  const vercel = headers.get('x-vercel-forwarded-for');
  if (vercel) return vercel.split(',')[0]!.trim();
  const real = headers.get('x-real-ip');
  if (real) return real.trim();
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return 'unknown';
}
