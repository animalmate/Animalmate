// 지원자 상태를 화면에 뭐라고 쓸지 한 곳에서 정한다.
//
// 왜 분리했나: 집계 화면과 최종 결정 화면이 각자 삼항 연산자 사슬로 같은 표를 손으로 적고
// 있었고, 그러다 실제로 어긋났다. 최종 결정 화면 사슬에는 `doc_fail` 가지가 없어서
// **서류 불합격자와 심사 전 지원자가 나란히 "진행 중"으로** 표시됐다. 되돌리기 어려운 결정을
// 내리는 화면에서 이미 떨어진 사람이 살아 있는 후보처럼 보이는 상태였다.
//
// 상태를 하나 추가했을 때 어느 화면이 조용히 틀리는 일이 없도록, 표를 Record 로 두어
// 새 상태를 넣지 않으면 타입 검사가 막고, 단위 테스트가 전 상태를 훑는다.

import type { RecruitStatus } from './status';

/** 배지 색 계열. 실제 클래스는 BADGE_TONE_CLASS 가 정한다. */
export type BadgeTone = 'pass' | 'fail' | 'progress' | 'pending';

export interface StatusBadge {
  label: string;
  tone: BadgeTone;
}

const BADGES: Record<RecruitStatus, StatusBadge> = {
  received: { label: '서류 심사 중', tone: 'pending' },
  doc_pass: { label: '서류 합격', tone: 'pass' },
  doc_fail: { label: '서류 불합격', tone: 'fail' },
  interview_done: { label: '면접 완료', tone: 'progress' },
  interview_noshow: { label: '면접 불참', tone: 'fail' },
  final_pass: { label: '최종 합격', tone: 'pass' },
  final_fail: { label: '최종 불합격', tone: 'fail' },
};

/**
 * 모르는 값이 오면 감추지 말고 그대로 드러낸다.
 * 예전처럼 '진행 중' 같은 그럴듯한 기본값으로 뭉개면, 상태가 하나 늘었을 때
 * 화면은 멀쩡해 보이는데 내용이 틀린 상태로 오래 간다.
 */
export function recruitStatusBadge(status: string): StatusBadge {
  return BADGES[status as RecruitStatus] ?? { label: `알 수 없는 상태(${status})`, tone: 'pending' };
}

export const BADGE_TONE_CLASS: Record<BadgeTone, string> = {
  pass: 'bg-success-100 text-success-700',
  fail: 'bg-coral-100 text-coral-700',
  progress: 'bg-blue-100 text-blue-800',
  pending: 'bg-cream-100 text-ink-700',
};
