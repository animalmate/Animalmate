// API 오류 응답 공용 — 예기치 못한 예외를 클라이언트에 그대로 흘리지 않는다.
//
// 왜: 라우트들이 500 응답에 `e.message` 를 실어 보내면 DB 오류문(테이블·컬럼명, 제약조건 이름,
// 연결 정보)이나 내부 식별자가 로그인한 아무 사용자에게나 노출된다. 공격자에게는 스키마 지도이자
// 다음 공격의 재료다. 원인은 서버 로그에만 남기고, 밖으로는 고정 문구만 내보낸다.

import { NextResponse } from 'next/server';

/**
 * 예기치 못한 예외 → 서버 로그 기록 + 일반화된 500 응답.
 * @param scope 로그에서 어느 라우트인지 식별하는 짧은 이름(예: 'PATCH /api/reservations/[id]').
 */
export function internalError(scope: string, e: unknown): NextResponse {
  console.error(`[api] ${scope}`, e);
  return NextResponse.json({ error: 'internal' }, { status: 500 });
}

/**
 * 멤버십이 꺼진 계정(비활성화·장기 미접속 만료)의 내부 자료 조회 거부(403).
 *
 * 이런 계정도 로그인은 된다 — 홈 배너와 내 정보(본인 탈퇴)는 열려 있어야 해서다. 그러나 동아리
 * 내부 자료까지 열리면 "비활성화 = 지금 접근을 끊는다"(결정 13)가 다시 로그인하는 것만으로
 * 무너진다(2026-10-17 보안 감사). 화면은 requireActiveActor, API 는 이 응답으로 막는다.
 */
export function membershipInactive(): NextResponse {
  return NextResponse.json({ error: 'membership_inactive' }, { status: 403 });
}
