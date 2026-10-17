// 이메일 OTP(6자리) — 생성·HMAC 해시·검증(만료 10분, 시도 5회 제한). 평문 코드는 DB 에 저장하지 않는다.

import { randomInt, createHmac, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { emailCodes } from '@/db/schema';
import type * as schema from '@/db/schema';

type DB = PostgresJsDatabase<typeof schema>;
export type EmailCodePurpose = 'signup' | 'login';

export const OTP_TTL_SECONDS = 600; // 10분
export const MAX_OTP_ATTEMPTS = 5;
export const RESEND_COOLDOWN_SECONDS = 60; // 재전송 쿨다운

export class CooldownError extends Error {
  readonly status = 429;
  constructor(readonly retryAfter: number) {
    super(`cooldown ${retryAfter}s`);
    this.name = 'CooldownError';
  }
}

export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** 이메일+코드를 secret 으로 HMAC(평문 미저장). */
export function hashOtp(email: string, code: string, secret: string): string {
  return createHmac('sha256', secret).update(`${email.toLowerCase()}:${code}`).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export interface CreateCodeArgs {
  email: string;
  purpose: EmailCodePurpose;
  secret: string;
  now?: Date;
}

/**
 * 새 OTP 생성·저장(같은 email+purpose 의 미소비 코드는 무효화). 평문 코드를 반환(메일 발송용).
 *
 * 쿨다운 확인부터 새 행 저장까지를 **주소별 트랜잭션 잠금** 안에서 한다. 잠그지 않으면 같은
 * 주소로 동시에 들어온 요청이 모두 "직전 코드 없음"을 보고 각자 코드를 만들어, 60초 쿨다운과
 * 주소당 메일 상한의 의미가 흐려졌다(2026-10-17 보안 감사). 트랜잭션 단위 잠금이라 트랜잭션
 * 풀러(pgbouncer)에서도 쓸 수 있고, 커밋과 함께 풀린다.
 */
export async function createEmailCode(db: DB, args: CreateCodeArgs): Promise<string> {
  const now = args.now ?? new Date();

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`email_code:${args.purpose}:${args.email}`}))`);

    // 재전송 쿨다운: 직전 코드 발급 후 60초 내 재요청 차단.
    const [last] = await tx
      .select({ createdAt: emailCodes.createdAt })
      .from(emailCodes)
      .where(and(eq(emailCodes.email, args.email), eq(emailCodes.purpose, args.purpose)))
      .orderBy(desc(emailCodes.createdAt))
      .limit(1);
    if (last) {
      const elapsed = (now.getTime() - last.createdAt.getTime()) / 1000;
      if (elapsed < RESEND_COOLDOWN_SECONDS) {
        throw new CooldownError(Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed));
      }
    }

    const code = generateOtp();
    const codeHash = hashOtp(args.email, code, args.secret);
    const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);

    await tx
      .update(emailCodes)
      .set({ consumedAt: now })
      .where(
        and(
          eq(emailCodes.email, args.email),
          eq(emailCodes.purpose, args.purpose),
          isNull(emailCodes.consumedAt)
        )
      );
    await tx.insert(emailCodes).values({ email: args.email, codeHash, purpose: args.purpose, expiresAt });
    return code;
  });
}

export type OtpResult = 'ok' | 'invalid' | 'expired' | 'too_many_attempts' | 'not_found';

export interface VerifyCodeArgs {
  email: string;
  purpose: EmailCodePurpose;
  code: string;
  secret: string;
  now?: Date;
}

/**
 * 최신 미소비 코드로 검증. 성공 시 소비 처리.
 *
 * **비교하기 전에 시도 1회를 원자적으로 예약한다**(`attempts < 5` 일 때만 +1). 예전에는 읽은 값에
 * 1을 더해 덮어써서, 동시에 들어온 요청 20개가 모두 `attempts = 0` 을 보고 코드 하나에 20번을
 * 대입할 수 있었다(2026-10-17 보안 감사). 예약에 성공한 요청만 비교하므로 코드당 5회가 실제 상한이다.
 * 성공 시 소비도 `consumed_at IS NULL` 조건부라, 같은 코드로 두 요청이 동시에 성공하지 못한다.
 * (맞힌 시도도 1회로 센다 — 4번 틀린 뒤 5번째에 맞히면 예전처럼 통과한다.)
 */
export async function verifyEmailCode(db: DB, args: VerifyCodeArgs): Promise<OtpResult> {
  const now = args.now ?? new Date();
  const [row] = await db
    .select()
    .from(emailCodes)
    .where(
      and(
        eq(emailCodes.email, args.email),
        eq(emailCodes.purpose, args.purpose),
        isNull(emailCodes.consumedAt)
      )
    )
    .orderBy(desc(emailCodes.createdAt))
    .limit(1);

  if (!row) return 'not_found';
  if (row.expiresAt < now) return 'expired';
  if (row.attempts >= MAX_OTP_ATTEMPTS) return 'too_many_attempts';

  const [reserved] = await db
    .update(emailCodes)
    .set({ attempts: sql`${emailCodes.attempts} + 1` })
    .where(and(eq(emailCodes.id, row.id), isNull(emailCodes.consumedAt), lt(emailCodes.attempts, MAX_OTP_ATTEMPTS)))
    .returning({ id: emailCodes.id });
  // 읽은 뒤 그 사이에 다른 요청이 남은 시도를 다 썼거나 코드를 소비했다.
  if (!reserved) return 'too_many_attempts';

  const expected = hashOtp(args.email, args.code, args.secret);
  if (!safeEqual(row.codeHash, expected)) return 'invalid';

  const [consumed] = await db
    .update(emailCodes)
    .set({ consumedAt: now })
    .where(and(eq(emailCodes.id, row.id), isNull(emailCodes.consumedAt)))
    .returning({ id: emailCodes.id });
  return consumed ? 'ok' : 'invalid';
}
