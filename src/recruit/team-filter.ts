// 모집 화면의 팀 필터 규칙(순수). 심사·집계·배정·면접 콘솔이 모두 이 함수를 쓴다.

export const ALL_TEAMS_FILTER = 'ALL';

export interface TeamFilterable {
  assignedTeam?: string | null;
  wishTeam1?: string | null;
}

/**
 * 지원자가 속한 것으로 볼 팀.
 * 회장단이 팀을 배정했으면 그 팀, 아직 안 했으면 1지망.
 * (서류 집계 단계에서는 대개 배정 전이라 사실상 1지망 기준이 된다.)
 */
export function effectiveTeamOf(app: TeamFilterable): string | null {
  return app.assignedTeam || app.wishTeam1 || null;
}

/**
 * 팀 필터 통과 여부.
 *
 * 예전에는 2지망까지 함께 봤다(`|| wishTeam2 === selected`). 그래서 2팀을 골라도
 * "1지망 1팀 / 2지망 2팀"인 사람이 전부 딸려 나와, 필터가 안 걸리는 것처럼 보였다.
 * 팀별로 나눠 심사·집계하는 게 목적이므로 한 사람은 한 팀에만 나와야 한다.
 */
export function matchesTeamFilter(app: TeamFilterable, selectedTeam: string): boolean {
  if (!selectedTeam || selectedTeam === ALL_TEAMS_FILTER) return true;
  return effectiveTeamOf(app) === selectedTeam;
}
