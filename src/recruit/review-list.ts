// 5. 최종 검토 화면이 쓰는 목록 규칙(순수).
//
// 왜 화면 밖으로 뺐나: "누가 검토 대상인가"는 최종 결정 화면의 매트릭스 기준과 **같아야 하는**
// 사실이다. 두 화면이 각자 필터를 적으면 검토에서 본 사람과 결정에서 고르는 사람이 어긋나고,
// 그 어긋남은 아무 오류도 내지 않은 채 발표까지 간다(같은 이유로 status-label.ts 를 뺐다).

import { effectiveTeamOf, type TeamFilterable } from './team-filter';
import type { ReviewMark } from './review-marks';

/** 팀을 아직 모르는 사람을 담는 묶음 이름. 팀 이름과 겹칠 수 없게 화면 문구를 그대로 쓴다. */
export const UNASSIGNED_TEAM_LABEL = '팀 미지정';

export interface ReviewApplicant extends TeamFilterable {
  id: string;
  name: string;
  status: string;
  slotId?: string | null;
  /** 검토 표시(탈락/다른 팀) — `incomingMovesByTeam` 이 읽는다. 나머지 함수는 쓰지 않는다. */
  reviewMark?: ReviewMark | null;
  reviewMoveTeam?: string | null;
}

/**
 * 검토 대상 = **면접을 본 사람**.
 *
 * 최종 결정 화면의 매트릭스(`final/panel.tsx` 의 `inMatrix`)와 같은 기준이다 —
 * 면접에 배정됐고(slotId), 불참이 아니어야 한다. 상태로 `interview_done` 만 보지 않는 이유:
 * 최종 합격·불합격을 확정하는 순간 상태가 `final_*` 로 바뀌는데, 그때 이 화면이 텅 비면
 * 확정하고 나서 "왜 그렇게 정했더라"를 되짚을 자리가 사라진다.
 */
export function isUnderReview(app: ReviewApplicant): boolean {
  return app.slotId != null && app.status !== 'interview_noshow';
}

/** 정렬·표시에 필요한 점수만 추린 모양(aggregate.ts 의 집계 결과가 그대로 들어맞는다). */
export interface ReviewScoreLike {
  docScoreAvg: number | null;
  interviewScoreAvg: number | null;
}

/**
 * 검토 순서 = **면접 평균 내림차순**, 같으면 서류 평균, 그것도 같으면 이름.
 *
 * 점수가 없는 사람은 맨 뒤로 보낸다. 0점으로 치면 아무도 채점하지 않은 사람이
 * 0점을 받은 사람과 같은 자리에 서는데, 둘은 전혀 다른 사실이다(09-RECRUIT-DESIGN §3).
 */
export function sortForReview<T extends ReviewApplicant>(
  applicants: T[],
  scores: Record<string, ReviewScoreLike | undefined>
): T[] {
  const rank = (v: number | null | undefined) => (v === null || v === undefined ? -1 : v);
  return [...applicants].sort((a, b) => {
    const ia = rank(scores[a.id]?.interviewScoreAvg);
    const ib = rank(scores[b.id]?.interviewScoreAvg);
    if (ia !== ib) return ib - ia;
    const da = rank(scores[a.id]?.docScoreAvg);
    const db = rank(scores[b.id]?.docScoreAvg);
    if (da !== db) return db - da;
    return a.name.localeCompare(b.name, 'ko');
  });
}

export interface ReviewTeamGroup<T> {
  team: string;
  applicants: T[];
}

/**
 * 팀별로 묶는다. **입력 순서를 묶음 안에서 그대로 지킨다** — 정렬은 `sortForReview` 가 먼저 하고,
 * 여기서는 나누기만 한다(두 곳에서 정렬하면 어느 쪽이 이겼는지 알 수 없다).
 *
 * 묶음 순서는 기수 설정의 팀 목록(`teamOrder`) 순서다. 화면의 팀 드롭다운과 같은 순서라야
 * "1팀 다음이 2팀"이라는 눈의 기대가 유지된다. 목록에 없는 팀 이름(옛 기수 값이나 지역이 붙어
 * 남은 값)은 뒤에 나온 순서대로 붙이고, 팀을 모르는 사람은 맨 끝 '팀 미지정'으로 모은다.
 */
export function groupApplicantsByTeam<T extends ReviewApplicant>(
  applicants: T[],
  teamOrder: string[] = []
): ReviewTeamGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const app of applicants) {
    const team = effectiveTeamOf(app) || UNASSIGNED_TEAM_LABEL;
    const bucket = buckets.get(team);
    if (bucket) bucket.push(app);
    else buckets.set(team, [app]);
  }

  const out: ReviewTeamGroup<T>[] = [];
  const taken = new Set<string>();

  for (const team of teamOrder) {
    const applicantsOfTeam = buckets.get(team);
    // 비어 있는 팀은 제목만 남아 "여기 아무도 없다"를 매번 읽게 하므로 내보내지 않는다.
    if (!applicantsOfTeam || taken.has(team)) continue;
    taken.add(team);
    out.push({ team, applicants: applicantsOfTeam });
  }

  for (const [team, applicantsOfTeam] of buckets) {
    if (taken.has(team) || team === UNASSIGNED_TEAM_LABEL) continue;
    out.push({ team, applicants: applicantsOfTeam });
  }

  const unassigned = buckets.get(UNASSIGNED_TEAM_LABEL);
  if (unassigned) out.push({ team: UNASSIGNED_TEAM_LABEL, applicants: unassigned });

  return out;
}

export interface IncomingMove<T> {
  applicant: T;
  /** 옮기기 전 원래 팀(`effectiveTeamOf`). 표시 문구 "5팀 → 4팀"의 앞쪽. */
  fromTeam: string;
}

/**
 * '다른 팀' 표시를 **갈 팀 기준**으로 다시 묶는다.
 *
 * 왜 필요한가: `review_mark='move'` 는 지원자의 **원래 팀** 박스에 있는 체크박스에서 켠다
 * ("얘는 우리 팀이 아니라 4팀이 맞다"). 그런데 그 표시를 보려고 4팀장이 열어야 하는 화면은
 * 5팀 박스다 — 자기 팀 화면만 보는 4팀장에게는 "밖에서 우리 팀으로 온다는 사람"이 아무 데도
 * 안 보인다. 그래서 갈 팀(`reviewMoveTeam`)을 기준으로 다시 묶어, 그 팀 박스 맨 위에 얹을
 * 목록을 만든다.
 *
 * **입력은 팀 필터를 걸지 않은 전체 목록이어야 한다** — 이미 자기 팀으로 걸러진 목록을 넣으면
 * 다른 팀에서 넘어오는 사람이 애초에 걸러져 있어 아무것도 안 나온다(`groupApplicantsByTeam` 이
 * 나누기 *전* 목록, 화면의 `pool`).
 *
 * 갈 팀을 아직 안 고른 표시(`reviewMoveTeam` 이 비어 있음 = 팀 미정)는 묶을 자리가 없어 뺀다 —
 * 이미 목록 위 "팀 미정 N명" 숫자로 알린다. 원래 팀과 갈 팀이 같으면(팀을 옮기지 않는 표시)도
 * 뺀다 — 자기 박스에 자기 카드를 또 얹을 이유가 없다.
 */
export function incomingMovesByTeam<T extends ReviewApplicant>(
  applicants: T[]
): Map<string, IncomingMove<T>[]> {
  const out = new Map<string, IncomingMove<T>[]>();
  for (const app of applicants) {
    if (app.reviewMark !== 'move') continue;
    const toTeam = app.reviewMoveTeam?.trim();
    if (!toTeam) continue;
    const fromTeam = effectiveTeamOf(app) || UNASSIGNED_TEAM_LABEL;
    if (fromTeam === toTeam) continue;
    const entry: IncomingMove<T> = { applicant: app, fromTeam };
    const list = out.get(toTeam);
    if (list) list.push(entry);
    else out.set(toTeam, [entry]);
  }
  return out;
}
