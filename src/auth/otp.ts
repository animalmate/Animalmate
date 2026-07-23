// 이메일 OTP(6자리) — 생성·HMAC 해시·검증(만료 10분, 시도 5회 제한). 평문 코드는 DB 에 저장하지 않는다.

import { randomInt, createHmac, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { emailCodes } from '@/db/schema';
import type * as schema from '@/db/schema';

type DB = PostgresJsDatabase<typeof schema>;
export type EmailCodePurpose = 'signup' | 'login';

export const OTP_TTL_SECONDS = 600; // 10분
export const MAX_OTP_ATTEMPTS = 5;

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

/** 새 OTP 생성·저장(같은 email+purpose 의 미소비 코드는 무효화). 평문 코드를 반환(메일 발송용). */
export async function createEmailCode(db: DB, args: CreateCodeArgs): Promise<string> {
  const now = args.now ?? new Date();
  const code = generateOtp();
  const codeHash = hashOtp(args.email, code, args.secret);
  const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);

  await db
    .update(emailCodes)
    .set({ consumedAt: now })
    .where(
      and(
        eq(emailCodes.email, args.email),
        eq(emailCodes.purpose, args.purpose),
        isNull(emailCodes.consumedAt)
      )
    );
  await db.insert(emailCodes).values({ email: args.email, codeHash, purpose: args.purpose, expiresAt });
  return code;
}

export type OtpResult = 'ok' | 'invalid' | 'expired' | 'too_many_attempts' | 'not_found';

export interface VerifyCodeArgs {
  email: string;
  purpose: EmailCodePurpose;
  code: string;
  secret: string;
  now?: Date;
}

/** 최신 미소비 코드로 검증. 성공 시 소비 처리. 실패 시 시도수 증가. */
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

  const expected = hashOtp(args.email, args.code, args.secret);
  if (!safeEqual(row.codeHash, expected)) {
    await db.update(emailCodes).set({ attempts: row.attempts + 1 }).where(eq(emailCodes.id, row.id));
    return 'invalid';
  }
  await db.update(emailCodes).set({ consumedAt: now }).where(eq(emailCodes.id, row.id));
  return 'ok';
}
