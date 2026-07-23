// 인증 라우트 공용 — 에러 매핑 + 세션 쿠키 설정/삭제.
import { NextResponse } from 'next/server';
import { AuthError } from './auth-service';
import { SESSION_COOKIE, DEFAULT_TTL_SECONDS } from './session';

export function authErrorResponse(e: unknown): NextResponse {
  if (e instanceof AuthError) return NextResponse.json({ error: e.code }, { status: e.status });
  return NextResponse.json({ error: 'internal' }, { status: 500 });
}

export function jsonWithSession(body: unknown, token: string): NextResponse {
  const res = NextResponse.json(body);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DEFAULT_TTL_SECONDS,
  });
  return res;
}

export function clearedSession(): NextResponse {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}

export function requireSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new AuthError('server_misconfigured', 500);
  return secret;
}
