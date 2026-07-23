// 현재 사용자 — 세션 쿠키 → JWT 검증 → DB 에서 Actor 구성(권한의 진실은 DB). 라우트에서 사용.
import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db/client';
import { verifySession, SESSION_COOKIE } from './session';
import { loadActor } from './auth-service';
import { isPrivileged, isStaffPlus, type Actor } from './permissions';

export async function getCurrentActor(): Promise<Actor | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const jar = await cookies();
  const payload = verifySession(jar.get(SESSION_COOKIE)?.value, secret);
  if (!payload) return null;
  return loadActor(db, payload.sub);
}

/** 로그인 필수(서버 컴포넌트). 미로그인 시 /login 으로. */
export async function requireActor(): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) redirect('/login');
  return actor;
}

/** 운영진 이상 필수. 부족하면 홈으로. */
export async function requireStaff(): Promise<Actor> {
  const actor = await requireActor();
  if (!isStaffPlus(actor.role)) redirect('/');
  return actor;
}

/** 회장단/시스템관리자 필수. 부족하면 홈으로. */
export async function requireBoard(): Promise<Actor> {
  const actor = await requireActor();
  if (!isPrivileged(actor.role)) redirect('/');
  return actor;
}
