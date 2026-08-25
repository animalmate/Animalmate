// 현재 사용자 — 세션 쿠키 → JWT 검증 → DB 에서 Actor 구성(권한의 진실은 DB). 라우트에서 사용.
import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db/client';
import { verifySession, SESSION_COOKIE } from './session';
import { loadActor } from './auth-service';
import { authorize, isPrivileged, isStaffPlus, type Actor } from './permissions';

export async function getCurrentActor(): Promise<Actor | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const jar = await cookies();
  const payload = verifySession(jar.get(SESSION_COOKIE)?.value, secret);
  if (!payload) return null;
  // 서명·만료가 유효해도 세대 번호가 밀렸으면(= 그 사이 "모든 기기에서 로그아웃") 거부한다.
  return loadActor(db, payload.sub, payload.sv);
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

/**
 * 모집 공고 편집 권한 필수 — 회장단, 또는 공고 편집 권한이 켜진 팀(홍보팀)의 운영진.
 * 부족하면 홈으로.
 *
 * `authorize` 를 거치는 이유는 임기 만료(membershipActive=false)까지 한 번에 막기 위해서다.
 * 이 화면은 대외에 그대로 나가는 공고를 쓰는 자리라, 만료된 계정이 남아 있으면 안 된다.
 */
export async function requireNoticeEditor(): Promise<Actor> {
  const actor = await requireActor();
  if (!authorize(actor, { kind: 'recruit.notice' }).allowed) redirect('/');
  return actor;
}
