import { db } from '@/db/client';
import { verifyLogin } from '@/auth/auth-service';
import { authErrorResponse, jsonWithSession, requireSecret } from '@/auth/route-helpers';
import { defaultMailer } from '@/auth/mailer';
import { consumeRateLimit, resetRateLimit, clientIp, RULES } from '@/http/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 로그인 2단계: OTP 검증 → 세션 쿠키 발급.
export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req.headers);
  try {
    // 코드당 5회 제한(otp.ts)은 새 코드를 받으면 초기화된다 — IP 단위 상한으로 그 우회를 막는다.
    await consumeRateLimit(db, RULES.otpVerify, ip);
    const { email, code } = await req.json();
    const { token, userId, role } = await verifyLogin(
      db,
      { email, code: String(code ?? '') },
      { secret: requireSecret(), mailer: defaultMailer() }
    );
    await resetRateLimit(db, RULES.otpVerify, ip); // 정상 로그인은 실패 누적을 되돌린다
    return jsonWithSession({ ok: true, userId, role }, token);
  } catch (e) {
    return authErrorResponse(e);
  }
}
