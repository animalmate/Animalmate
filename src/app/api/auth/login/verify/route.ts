import { db } from '@/db/client';
import { AuthError, verifyLogin } from '@/auth/auth-service';
import { authErrorResponse, jsonWithSession, requireSecret } from '@/auth/route-helpers';
import { defaultMailer } from '@/auth/mailer';
import { consumeRateLimit, refundRateLimit, resetRateLimit, clientIp, RULES } from '@/http/rate-limit';
import { LIMITS, checkLength } from '@/http/input';
import { isValidEmail, normalizeEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 로그인 2단계: OTP 검증 → 세션 쿠키 발급.
export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req.headers);
  try {
    // 코드당 5회 제한(otp.ts)은 새 코드를 받으면 초기화된다 — 상한으로 그 우회를 막는다.
    // IP 단위는 폭주 차단용(공유 IP 뒤 여러 명이 정상), 주소 단위가 무차별 대입의 실제 방어선.
    await consumeRateLimit(db, RULES.otpVerify, ip);
    const { email, code } = await req.json();
    const addr = normalizeEmail(String(email ?? ''));
    // 주소 단위 통을 깎기 **전에** 모양부터 본다. 주소가 아닌 값에는 코드가 발급됐을 리 없고,
    // 검증 전 값을 그대로 식별자로 쓰면 이상한 값 하나로 그 통을 건너뛸 수 있었다(2026-10-17 감사).
    checkLength('이메일', addr, LIMITS.email);
    if (!isValidEmail(addr)) throw new AuthError('otp_invalid');
    await consumeRateLimit(db, RULES.otpVerifyEmail, addr);
    const { token, userId, role } = await verifyLogin(
      db,
      { email: addr, code: String(code ?? '') },
      { secret: requireSecret(), mailer: defaultMailer() }
    );
    // 정상 로그인은 **자기 몫만** 되돌린다. IP 통을 통째로 지우면, 공격자가 자기 계정으로 한 번
    // 로그인하는 것만으로 남의 주소에 쌓은 실패를 지울 수 있었다(2026-10-17 감사, 결정 169).
    // 주소 통은 코드를 맞힌 사람이 곧 주인이라 지워도 된다.
    await refundRateLimit(db, RULES.otpVerify, ip);
    await resetRateLimit(db, RULES.otpVerifyEmail, addr);
    return jsonWithSession({ ok: true, userId, role }, token);
  } catch (e) {
    return authErrorResponse(e);
  }
}
