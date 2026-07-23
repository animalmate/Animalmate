import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { requestLogin } from '@/auth/auth-service';
import { defaultMailer } from '@/auth/mailer';
import { authErrorResponse, requireSecret } from '@/auth/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 로그인 1단계: 이메일 → (계정 있으면) OTP 발송. 계정 열거 방지로 없어도 동일 응답.
export async function POST(req: Request): Promise<Response> {
  try {
    const { email } = await req.json();
    await requestLogin(db, { email }, { secret: requireSecret(), mailer: defaultMailer() });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return authErrorResponse(e);
  }
}
