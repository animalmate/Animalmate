import { db } from '@/db/client';
import { verifyLogin } from '@/auth/auth-service';
import { authErrorResponse, jsonWithSession, requireSecret } from '@/auth/route-helpers';
import { defaultMailer } from '@/auth/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 로그인 2단계: OTP 검증 → 세션 쿠키 발급.
export async function POST(req: Request): Promise<Response> {
  try {
    const { email, code } = await req.json();
    const { token, userId, role } = await verifyLogin(
      db,
      { email, code },
      { secret: requireSecret(), mailer: defaultMailer() }
    );
    return jsonWithSession({ ok: true, userId, role }, token);
  } catch (e) {
    return authErrorResponse(e);
  }
}
