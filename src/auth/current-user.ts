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

/**
 * 로그인 + **활성 멤버십** 필수(서버 컴포넌트). 멤버십이 꺼졌으면 홈으로 — 홈이 "멤버십이 아직
 * 활성화되지 않았어요" 배너로 회장단에게 문의하라고 안내한다.
 *
 * requireActor 와 갈라 둔 이유: 비활성화된 계정도 로그인은 된다. 홈·내 정보(전화 수정, 본인 탈퇴 —
 * 개인정보처리방침이 약속한 길)는 열려 있어야 하기 때문이다. 그러나 동아리 내부 자료(캘린더·번개·
 * 가이드북·챗봇)까지 열려 있으면 "비활성화 = 지금 접근을 끊는다"(결정 13)가 다시 로그인하는 것만으로
 * 무너진다(2026-10-17 보안 감사). 운영진 이상 화면은 requireStaff 가 이미 막는다 — 비활성 계정의
 * 역할은 활성 멤버십에서만 나오므로 항상 member 다.
 */
export async function requireActiveActor(): Promise<Actor> {
  const actor = await requireActor();
  if (!actor.membershipActive) redirect('/');
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
