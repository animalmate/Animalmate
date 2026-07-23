// 현재 사용자 — 세션 쿠키 → JWT 검증 → DB 에서 Actor 구성(권한의 진실은 DB). 라우트에서 사용.
import 'server-only';
import { cookies } from 'next/headers';
import { db } from '@/db/client';
import { verifySession, SESSION_COOKIE } from './session';
import { loadActor } from './auth-service';
import type { Actor } from './permissions';

export async function getCurrentActor(): Promise<Actor | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const jar = await cookies();
  const payload = verifySession(jar.get(SESSION_COOKIE)?.value, secret);
  if (!payload) return null;
  return loadActor(db, payload.sub);
}
