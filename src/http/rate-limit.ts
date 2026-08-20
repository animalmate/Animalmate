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
  /**
   * 가입 요청 — **한 IP 뒤에 여러 명이 있는 것이 정상**이라는 전제로 잡는다.
   *
   * 동아리 가입은 한자리에 모여서(같은 WiFi) 또는 통신사 CGNAT 를 통해 일어난다 —
   * 실사용 개시일 저녁에 운영진 수십 명이 같은 공인 IP 로 들어오는 것이 정상 경로다.
   * 예전 값(시간당 10)은 11번째 사람부터 최대 1시간 차단이라 **가입 자체를 막는 값**이었다.
   * 여기 남은 목적은 자동화·폭주로부터 DB·메일을 지키는 것뿐이고,
   * 가입코드 대입 방어는 아래 signupCodeFail(실패만 센다)이 따로 맡는다.
   */
  signupRequest: { bucket: 'signup_request', windowSeconds: 3600, max: 60 },
  /**
   * 가입코드 **오답**만 센다 — 코드 오라클(무제한 대입) 방어의 본체.
   *
   * 요청 전체를 세면 정상 가입자와 공격자가 같은 통을 나눠 쓰게 되어, 둘 중 하나를 포기해야 한다.
   * 대입 공격은 정의상 *틀린* 코드를 반복하는 것이므로 **틀린 시도만** 세면 둘 다 만족한다 —
   * 코드를 아는 사람은 아무리 많아도 이 통을 건드리지 않는다.
   *
   * 값을 인원수(30)에 맞춘 이유: 이 통도 IP 단위라 **한자리에 모인 사람들이 나눠 쓴다.**
   * 게다가 오타는 서로 독립적이지 않다 — 코드를 불러 주면 `0`/`O` 처럼 **여러 명이 똑같이**
   * 틀린다. 통이 좁으면 그렇게 다 써 버린 뒤, 정직하게 잘못 친 사람이 "가입코드가 틀렸다" 대신
   * 영문 모를 429 를 본다(정답을 친 사람은 어차피 이 통을 안 쓰므로 계속 통과한다).
   * 대입 방어는 그대로다: 가입코드는 최소 6자 [A-Z0-9](≈22억 가지)라, 시간당 10이든 30이든
   * 무차별 대입에는 똑같이 무의미한 크기다.
   */
  signupCodeFail: { bucket: 'signup_code_fail', windowSeconds: 3600, max: 30 },
  /** 로그인 요청(OTP 발송). 가입과 같은 이유로 IP 를 공유하는 다수를 전제한다. */
  loginRequest: { bucket: 'login_request', windowSeconds: 3600, max: 60 },
  /**
   * OTP 검증 — **IP 단위**는 폭주 차단용으로만 남긴다(공유 IP 뒤 여러 명이 서로를 막지 않게).
   * 무차별 대입의 실제 방어선은 아래 otpVerifyEmail(주소 단위)이다.
   */
  otpVerify: { bucket: 'otp_verify', windowSeconds: 3600, max: 60 },
  /**
   * OTP 검증 — **주소 단위**. 무차별 대입이 노리는 것은 IP 가 아니라 특정 주소의 코드이므로,
   * 대상 주소로 묶어야 IP 를 바꿔 가며 시도하는 경로까지 막힌다.
   * 한 주소가 받을 수 있는 코드 자체가 시간당 5개(mailToAddress)라, 20회면 코드당 4회 —
   * 코드당 5회 제한(otp.ts)과 맞물려 실질 상한이 된다. 10^6 조합에 견줘 무의미한 수준.
   */
  otpVerifyEmail: { bucket: 'otp_verify_email', windowSeconds: 3600, max: 20 },
  /**
   * 수신 주소 기준 발송 상한(IP 가 아니라 **이메일**로 센다).
   * 가입 응답을 통일한 뒤로는 기가입 주소에도 안내 메일이 나가므로, IP 를 바꿔 가며
   * 특정인의 메일함을 채우는 괴롭힘이 가능해진다. 그 경로를 주소 단위로 막는다.
   * 가입 여부와 무관하게 같은 지점에서 적용해야 리밋 자체가 열거 신호가 되지 않는다.
   */
  mailToAddress: { bucket: 'mail_to_address', windowSeconds: 3600, max: 5 },
  /**
   * F9 신입 모집 비로그인 지원서 제출 — 도배·디도스 방지.
   *
   * 여기도 **한 IP 뒤에 여러 명이 있는 것이 정상**이다(가입과 같은 이유 — 학교 WiFi·통신사 CGNAT).
   * 모집 기간에 지원자가 한 IP 뒤에서 몰리면 예전 값(10분 5회)은 6번째부터 막았고,
   * 그 사람은 **지원 자체를 못 한다**(가입과 달리 되돌아올 이유도 없는 사람이다).
   *
   * 값을 올려도 중복 지원은 늘지 않는다 — 실제 중복 방어는 IP 가 아니라 **이름+전화 409**
   * (같은 기수 내 동일인 차단)이고, 모든 필드에 길이 상한이 걸려 있어 용량 공격도 막혀 있다.
   * 여기 남은 목적은 자동화 도배뿐이라, 사람 속도(10분에 30건 = 분당 3건)면 충분히 좁다.
   */
  recruitApply: { bucket: 'recruit_apply', windowSeconds: 600, max: 30 },
  /**
   * F9 신입 모집 비로그인 지원자 결과 조회 — **총량**(IP 단위). 쏟아지는 요청 자체를 막는다.
   *
   * 여기도 **한 IP 뒤에 여러 명이 있는 것이 정상**이다(79·73 과 같은 뿌리 — 학교 WiFi·기숙사·
   * 통신사 CGNAT). 게다가 이 통은 하필 **발표 직후**에 쓰인다 — 모두가 같은 순간에 확인하는,
   * 한 해에 가장 몰리는 1분이다. 예전 값(분당 5)은 그 1분에 한 IP 뒤 **6번째 사람부터** 막았고,
   * 그 사람은 자기가 뭘 잘못했는지 알 수 없는 429 를 본다.
   *
   * 값을 인원수와 1:1 로 맞추면 모자란다 — 한 사람이 한 번만 누르지 않는다(오타, 새로고침,
   * "혹시 바뀌었나" 다시 보기). 인원(30) × 사람당 2회 = 60 을 바닥으로 잡았다.
   *
   * 올려도 **열거 방어는 그대로다.** 특정인의 전화번호를 맞히려는 시도는 이 통이 아니라
   * 아래 recruitLookupFail(이름 HMAC, 시간당 10회)이 막는다(결정 80) — IP 를 바꿔 가며 노려도
   * 대상 단위로 모여 막히므로, 이 통을 넓히는 것과 무관하다. 여기 남은 목적은 도배 차단뿐이라
   * 분당 60(= 초당 1회)이면 사람이 아닌 것만 걸린다.
   *
   * 윈도를 60초로 **짧게** 유지하는 것도 의도다. 어쩌다 막히더라도 1분 안에 풀린다 —
   * 창을 넓게 잡으면(예: 5분 300회) 한 번 소진했을 때 발표날 저녁에 5분을 기다리게 된다.
   */
  recruitLookup: { bucket: 'recruit_lookup', windowSeconds: 60, max: 60 },
  /**
   * F9 결과 조회 **열거 방지** — 식별자는 IP 가 아니라 **조회 대상(이름)의 HMAC**이다
   * (2026-07-31, 결정 80. 키 생성은 `src/recruit/lookup-key.ts`).
   *
   * 열거 공격은 "특정인의 전화번호를 맞히는" 일이라 대상 단위로 세는 것이 맞다 —
   * IP 를 바꿔 가며 한 사람을 노려도 한 통에 모여 막히고(IP 기준보다 강하다),
   * 발표 직후 한 공인 IP 뒤 수십 명이 서로의 예산을 깎지도 않는다.
   */
  recruitLookupFail: { bucket: 'recruit_lookup_fail', windowSeconds: 3600, max: 10 },
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
