import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { requestSignup } from '@/auth/auth-service';
import { defaultMailer } from '@/auth/mailer';
import { authErrorResponse, requireSecret } from '@/auth/route-helpers';
import { consumeRateLimit, clientIp, RULES } from '@/http/rate-limit';
import { LIMITS, checkLength } from '@/http/input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 가입 1단계: 이메일 + 학기 가입코드 → 유효하면 6자리 OTP 발송.
export async function POST(req: Request): Promise<Response> {
  try {
    // 리밋을 가입코드 검사보다 **먼저** 건다. 이 엔드포인트는 코드가 맞는지 알려 주는 오라클이라,
    // 검사 뒤에 걸면 무제한 대입을 그대로 허용하게 된다.
    await consumeRateLimit(db, RULES.signupRequest, clientIp(req.headers));
    const { email, joinCode } = await req.json();
    checkLength('이메일', String(email ?? ''), LIMITS.email);
    await requestSignup(db, { email, joinCode: String(joinCode ?? '') }, { secret: requireSecret(), mailer: defaultMailer() });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return authErrorResponse(e);
  }
}
