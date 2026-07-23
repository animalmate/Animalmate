import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { requestSignup } from '@/auth/auth-service';
import { defaultMailer } from '@/auth/mailer';
import { authErrorResponse, requireSecret } from '@/auth/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 가입 1단계: 이메일 + 학기 가입코드 → 유효하면 6자리 OTP 발송.
export async function POST(req: Request): Promise<Response> {
  try {
    const { email, joinCode } = await req.json();
    await requestSignup(db, { email, joinCode }, { secret: requireSecret(), mailer: defaultMailer() });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return authErrorResponse(e);
  }
}
