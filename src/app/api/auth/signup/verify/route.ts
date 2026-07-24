import { db } from '@/db/client';
import { verifySignup } from '@/auth/auth-service';
import { defaultMailer } from '@/auth/mailer';
import { authErrorResponse, jsonWithSession, requireSecret } from '@/auth/route-helpers';
import { consumeRateLimit, resetRateLimit, clientIp, RULES } from '@/http/rate-limit';
import { LIMITS, checkLength } from '@/http/input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 가입 2단계: OTP 검증 → user + member 멤버십 생성 → 세션 쿠키 발급.
export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req.headers);
  try {
    // 로그인 검증과 같은 버킷을 공유한다 — 공격자가 가입/로그인을 번갈아 쓰며 상한을 두 배로 쓰지 못하게.
    await consumeRateLimit(db, RULES.otpVerify, ip);
    const { email, code, name } = await req.json();
    checkLength('이름', name == null ? null : String(name), LIMITS.name);
    const { token, userId } = await verifySignup(
      db,
      { email, code: String(code ?? ''), name },
      { secret: requireSecret(), mailer: defaultMailer() }
    );
    await resetRateLimit(db, RULES.otpVerify, ip);
    return jsonWithSession({ ok: true, userId }, token);
  } catch (e) {
    return authErrorResponse(e);
  }
}
