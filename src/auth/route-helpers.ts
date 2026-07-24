// 인증 라우트 공용 — 에러 매핑 + 세션 쿠키 설정/삭제.
import { NextResponse } from 'next/server';
import { AuthError } from './auth-service';
import { CooldownError } from './otp';
import { RateLimitError } from '@/http/rate-limit';
import { InputTooLongError } from '@/http/input';
import { SESSION_COOKIE, DEFAULT_TTL_SECONDS } from './session';

export function authErrorResponse(e: unknown): NextResponse {
  if (e instanceof CooldownError) {
    return NextResponse.json({ error: 'cooldown', retryAfter: e.retryAfter }, { status: 429 });
  }
  // 리밋 초과는 쿨다운과 같은 모양으로 돌려준다(화면이 "잠시 후 다시" 안내를 그대로 쓴다).
  if (e instanceof RateLimitError) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfter: e.retryAfter },
      { status: 429, headers: { 'Retry-After': String(e.retryAfter) } }
    );
  }
  if (e instanceof InputTooLongError) {
    return NextResponse.json({ error: 'too_long', field: e.field, max: e.max }, { status: 400 });
  }
  if (e instanceof AuthError) return NextResponse.json({ error: e.code }, { status: e.status });
  console.error('[api] auth', e); // 원인은 서버 로그에만(응답에는 고정 문구).
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
