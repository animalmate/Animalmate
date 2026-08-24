// 5. 최종 검토 화면에서 팀장단이 붙이는 **의견 표시** 규칙(순수).
//
// 왜 이 화면에 쓰기가 생겼나: 예전 최종 검토는 완전한 읽기 전용이었다. 그래서 팀장단이 모여
// "얘는 빼자", "얘는 2팀이 맞다"를 이야기해도 남는 자리가 없어서, 회의가 끝나면 각자 수첩과
// 기억에만 있었고 6번 화면(회장단)에는 아무것도 넘어가지 않았다.
//
// 여기서 붙이는 것은 **결정이 아니라 의견**이다. 상태(recruit_status)는 그대로 두고, 합격/불합격은
// 여전히 6번에서 회장단이 정한다(09-RECRUIT-DESIGN §0 "채점은 운영진, 결정은 회장단").
// 그래서 상태 전이 규칙(status.ts)을 태우지 않는다 — 잘못 누르면 그냥 다시 누르면 된다.

/** drop = 탈락시킬 사람 / move = 다른 팀으로 보낼 사람. 표시가 없으면 null. */
export type ReviewMark = 'drop' | 'move';

export const REVIEW_MARK_VALUES = ['drop', 'move'] as const;

/** 화면·도움말이 함께 쓰는 문구. 두 곳이 따로 적으면 회의 중에 서로 다른 말을 가리키게 된다. */
export const REVIEW_MARK_LABEL: Record<ReviewMark, string> = {
  drop: '탈락',
  move: '다른 팀',
};

/** API 가 받은 값을 믿지 않고 거른다 — 화면에서 두 개만 보낸다는 것은 검증이 아니다(규칙 #6). */
export function isReviewMark(value: unknown): value is ReviewMark {
  return value === 'drop' || value === 'move';
}

/** 서버가 받는 값. `null` 은 "표시를 지운다"는 뜻이라 정상 입력이다. */
export function parseReviewMark(value: unknown): ReviewMark | null | undefined {
  if (value === null) return null;
  return isReviewMark(value) ? value : undefined;
}

/**
 * 체크박스를 눌렀을 때의 다음 값.
 *
 * 두 칸이지만 값은 하나다: 켜져 있는 것을 다시 누르면 **꺼지고**, 다른 쪽을 누르면 **넘어간다**.
 * 지우기 버튼을 따로 두지 않는 이유 — 잘못 누른 사람이 제일 먼저 하는 행동이 "방금 누른 것을
 * 다시 누르기"다. 그때 아무 일도 안 일어나면 표시가 박힌 줄 알고 회장단에게 말로 전한다.
 */
export function nextReviewMark(current: ReviewMark | null, clicked: ReviewMark): ReviewMark | null {
  return current === clicked ? null : clicked;
}

/** 갈 팀을 아직 안 고른 '다른 팀' 표시의 화면 문구. 셀렉트의 빈 선택지도 이 말을 쓴다. */
export const MOVE_TEAM_UNSET_LABEL = '팀 미정';

/**
 * '다른 팀' 표시에 딸린 **갈 팀**을 정리한다.
 *
 * 두 가지를 여기서 못 박는다.
 *
 * 1. **비워 둘 수 있다.** 회의에서는 "얘는 우리 팀이 아니다"까지만 정하고 갈 곳은 나중에 맞추는
 *    일이 흔하다. 팀을 고르게 강제하면 아무 팀이나 찍고 넘어가는데, 그러면 6번 화면은 그것을
 *    회의가 정한 목적지로 읽는다 — 안 고른 것과 아무거나 고른 것은 전혀 다른 사실이다.
 * 2. **표시가 'move' 가 아니면 팀은 없다.** 탈락으로 바꾸거나 표시를 지웠는데 옛 목적지가 남으면,
 *    회장단이 "탈락인데 2팀으로 보내라는 건가"를 되물어야 한다. 표시를 옮기는 순간 같이 지운다.
 */
export function normalizeMoveTeam(mark: ReviewMark | null, team: unknown): string | null {
  if (mark !== 'move') return null;
  if (typeof team !== 'string') return null;
  const trimmed = team.trim();
  return trimmed ? trimmed : null;
}

export interface ReviewMarkable {
  reviewMark?: ReviewMark | null;
}

/**
 * 표시된 인원 수. 검토 회의는 "몇 명 뺄지"를 숫자로 말하므로 목록 위에 붙일 값이 필요하다.
 * 한 번 훑어 두 값을 함께 센다 — 화면이 필터를 바꿀 때마다 다시 세는 자리라서.
 */
export function countReviewMarks(applicants: ReviewMarkable[]): Record<ReviewMark, number> {
  const counts: Record<ReviewMark, number> = { drop: 0, move: 0 };
  for (const app of applicants) {
    if (app.reviewMark === 'drop' || app.reviewMark === 'move') counts[app.reviewMark] += 1;
  }
  return counts;
}
