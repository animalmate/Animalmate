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
    // 주소 단위 발송 상한 — 가입 여부를 보기 **전에** 걸어야 리밋 응답이 열거 신호가 되지 않는다.
    await consumeRateLimit(db, RULES.mailToAddress, String(email ?? '').trim().toLowerCase());
    await requestSignup(db, { email, joinCode: String(joinCode ?? '') }, { secret: requireSecret(), mailer: defaultMailer() });
    // 응답은 가입 여부와 무관하게 동일하다. 구분 정보는 메일함으로만 간다(계정 열거 차단).
    return NextResponse.json({ ok: true });
  } catch (e) {
    return authErrorResponse(e);
  }
}
