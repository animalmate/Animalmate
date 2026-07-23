import { db } from '@/db/client';
import { verifySignup } from '@/auth/auth-service';
import { defaultMailer } from '@/auth/mailer';
import { authErrorResponse, jsonWithSession, requireSecret } from '@/auth/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 가입 2단계: OTP 검증 → user + member 멤버십 생성 → 세션 쿠키 발급.
export async function POST(req: Request): Promise<Response> {
  try {
    const { email, code, name } = await req.json();
    const { token, userId } = await verifySignup(
      db,
      { email, code, name },
      { secret: requireSecret(), mailer: defaultMailer() }
    );
    return jsonWithSession({ ok: true, userId }, token);
  } catch (e) {
    return authErrorResponse(e);
  }
}
