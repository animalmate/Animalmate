// 세션 — 커스텀 HS256 JWT(httpOnly 쿠키에 담는다). SESSION_SECRET 으로 서명/검증. 무의존.
// 서버 전용 서명 검증만 하며, DB 세션 테이블 없이 stateless. 만료(exp) 포함.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Role } from './permissions';

export const SESSION_COOKIE = 'am_session';
export const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 180; // 180일(한 학기 + 방학)

export interface SessionPayload {
  sub: string; // user id
  role: Role;
  /**
   * 발급 시점의 users.session_version. 요청마다 DB 값과 대조해 다르면 거부한다(current-user).
   * 서명만으로는 "발급 후 취소된 세션"을 걸러낼 수 없어서 필요하다 — 이 값이 무효화의 근거다.
   * 옛 토큰에는 없으므로(배포 시점에 이미 발급된 세션) 없으면 0 으로 본다.
   */
  sv: number;
  iat: number;
  exp: number;
}

const b64url = (buf: Buffer): string => buf.toString('base64url');
const encode = (o: unknown): string => b64url(Buffer.from(JSON.stringify(o)));

export function signSession(
  claims: { sub: string; role: Role; sv?: number },
  secret: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): string {
  if (!secret) throw new Error('SESSION_SECRET 가 필요합니다.');
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub: claims.sub, role: claims.role, sv: claims.sv ?? 0, iat: now, exp: now + ttlSeconds });
  const data = `${header}.${payload}`;
  const sig = b64url(createHmac('sha256', secret).update(data).digest());
  return `${data}.${sig}`;
}

/** 서명·만료 검증. 통과 시 payload, 아니면 null. */
export function verifySession(token: string | null | undefined, secret: string): SessionPayload | null {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts as [string, string, string];
  const expected = b64url(createHmac('sha256', secret).update(`${header}.${payload}`).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let parsed: SessionPayload;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof parsed.exp !== 'number' || parsed.exp < Math.floor(Date.now() / 1000)) return null;
  if (typeof parsed.sub !== 'string') return null;
  // sv 는 이 배포 이전에 발급된 토큰에 없다 — 없으면 0(초기 세대)으로 본다.
  if (typeof parsed.sv !== 'number') parsed.sv = 0;
  return parsed;
}
