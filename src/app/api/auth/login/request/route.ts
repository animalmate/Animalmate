import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { requestLogin } from '@/auth/auth-service';
import { defaultMailer } from '@/auth/mailer';
import { authErrorResponse, requireSecret } from '@/auth/route-helpers';
import { consumeRateLimit, clientIp, RULES } from '@/http/rate-limit';
import { LIMITS, checkLength } from '@/http/input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 로그인 1단계: 이메일 → (계정 있으면) OTP 발송. 계정 열거 방지로 없어도 동일 응답.
export async function POST(req: Request): Promise<Response> {
  try {
    // IP 단위 상한. 이메일별 60초 쿨다운(otp.ts)만으로는 이메일을 바꿔 가며 메일을 퍼붓는 것을 못 막는다.
    await consumeRateLimit(db, RULES.loginRequest, clientIp(req.headers));
    const { email } = await req.json();
    checkLength('이메일', String(email ?? ''), LIMITS.email);
    await requestLogin(db, { email }, { secret: requireSecret(), mailer: defaultMailer() });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return authErrorResponse(e);
  }
}
