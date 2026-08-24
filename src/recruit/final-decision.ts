// 6. 최종 결정 화면이 5번 최종 검토의 표시로 합격/불합격/최종 팀을 계산하는 규칙(순수).
//
// 왜 이 파일이 생겼나: 예전 6번은 회장단이 매트릭스에서 사람을 하나하나 다시 골라 확정했다.
// 그런데 실제로는 팀장단이 이미 5번(최종 검토)에서 탈락·다른 팀을 정리해 두고, 회장단은
// 그 결론을 보고 확정 버튼(과 공개 스위치)만 누른다(2026-08-24 사용자 지정 — "어차피 5 최종
// 검토에서 확정하고 회장단은 공개를 누르기만 하는거라서"). 표시가 사실상 결정이 되므로
// "표시 → 최종 합격/불합격/최종 팀"으로 바꾸는 규칙을 한 곳에 모은다 — 화면(미리보기 표)과
// 확정 API 호출이 각자 계산하면 화면에 보인 결과와 실제로 확정되는 결과가 어긋날 수 있다.

import { effectiveTeamOf, type TeamFilterable } from './team-filter';
import type { ReviewMark } from './review-marks';

export interface FinalDecidable extends TeamFilterable {
  id: string;
  reviewMark?: ReviewMark | null;
  reviewMoveTeam?: string | null;
}

export type FinalOutcome = 'pass' | 'fail' | 'unscored' | 'move_team_unset';

export interface FinalDecision<T> {
  applicant: T;
  outcome: FinalOutcome;
  /** `outcome === 'pass'` 일 때만 값이 있다. */
  finalTeam: string | null;
}

/**
 * 한 사람의 결과를 정한다.
 *
 * - **탈락 표시** → `fail`. 떨어진 사람의 팀은 의미가 없어 안 본다.
 * - **다른 팀 표시인데 갈 팀을 안 골랐다**(팀 미정) → `move_team_unset`. 회장단이 마음대로 팀을
 *   정하면 회의에서 안 정한 것을 정한 것처럼 확정하는 셈이라, 확정 대상에서 빼고 화면이 따로
 *   알린다(회장단이 스스로 고르지 않는다 — §0 "결정은 회장단"과 다른 결이다).
 * - **다른 팀 표시이고 갈 팀이 있다** → `pass`, 최종 팀 = 그 팀.
 * - **표시가 없는데 아무도 채점하지 않았다** → `unscored`. 팀장단이 5번에서 볼 근거 자체가
 *   없었을 사람이라 "표시 없음 = 합격"을 그대로 적용하면 안 된다. 확정 대상에서 뺀다.
 * - **표시가 없고 채점됐다** → `pass`, 최종 팀 = 배정팀(없으면 1지망) — 이 화면에서 지망을
 *   바꾸지 않는 한 지금 있던 팀 그대로 확정된다.
 */
export function decideFinalOutcome<T extends FinalDecidable>(
  applicant: T,
  scorerCount: number
): FinalDecision<T> {
  if (applicant.reviewMark === 'drop') {
    return { applicant, outcome: 'fail', finalTeam: null };
  }
  if (applicant.reviewMark === 'move') {
    const team = applicant.reviewMoveTeam?.trim();
    return team
      ? { applicant, outcome: 'pass', finalTeam: team }
      : { applicant, outcome: 'move_team_unset', finalTeam: null };
  }
  if (scorerCount <= 0) {
    return { applicant, outcome: 'unscored', finalTeam: null };
  }
  return { applicant, outcome: 'pass', finalTeam: effectiveTeamOf(applicant) };
}

export function decideFinalOutcomes<T extends FinalDecidable>(
  applicants: T[],
  scorerCountOf: (id: string) => number
): FinalDecision<T>[] {
  return applicants.map((a) => decideFinalOutcome(a, scorerCountOf(a.id)));
}

export interface FinalSummary<T> {
  pass: FinalDecision<T>[];
  fail: FinalDecision<T>[];
  unscored: FinalDecision<T>[];
  moveTeamUnset: FinalDecision<T>[];
}

/** 결과별로 나눈다. 확정 버튼은 `moveTeamUnset.length === 0` 일 때만 누를 수 있다(화면이 막는다). */
export function summarizeFinalDecisions<T>(decisions: FinalDecision<T>[]): FinalSummary<T> {
  return {
    pass: decisions.filter((d) => d.outcome === 'pass'),
    fail: decisions.filter((d) => d.outcome === 'fail'),
    unscored: decisions.filter((d) => d.outcome === 'unscored'),
    moveTeamUnset: decisions.filter((d) => d.outcome === 'move_team_unset'),
  };
}

/**
 * 합격자를 **최종 팀 기준으로 묶는다.**
 *
 * `bulk_team` API 는 같은 팀으로 보낼 id 목록을 한 번에 받는다 — 팀마다 한 번씩만 부르면 되므로
 * 203명이어도 팀 수(보통 5개 안팎)만큼만 호출한다. 사람마다 따로 부르면 확정 한 번에 수백 번
 * 왕복하게 된다.
 */
export function groupPassByFinalTeam<T extends { id: string }>(
  passDecisions: FinalDecision<T>[]
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const d of passDecisions) {
    if (!d.finalTeam) continue;
    const list = out.get(d.finalTeam);
    if (list) list.push(d.applicant.id);
    else out.set(d.finalTeam, [d.applicant.id]);
  }
  return out;
}
