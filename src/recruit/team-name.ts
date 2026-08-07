// 팀 이름 손질(순수) — 지역·집결지 꼬리를 떼고 팀 이름만 남긴다.
//
// 예전 지원서는 지망 팀 선택지에 지역을 붙여 받았다("1팀 - 강남(집결지 강남역)").
// 고른 값이 그대로 recruit_applicants 에 저장되는 구조라, 심사·집계 화면의 팀 배지가
// 한 줄을 넘기고 팀 이관 셀렉트도 읽기 어려웠다. 지역 안내는 지원서의 '팀 설명'
// (apply_form.teamDescription)이 맡고, 화면에 쓰는 팀 이름은 "1팀"까지다.
//
// 이미 접수된 지원자 행에는 긴 값이 남아 있으므로 **읽을 때** 줄인다 — 선택지만 짧게 바꾸면
// 옛 지원자는 팀 필터("1팀")에 걸리지 않고 사라진다.

/** 팀 이름과 설명을 가르는 문자. 대시 3종과 여는 괄호(반각·전각). */
const TAIL = /\s*[-–—(（]/;

/**
 * "1팀 - 강남(집결지 강남역)" → "1팀". 구분자가 없으면 그대로 둔다
 * ("2순위 팀 배치 희망하지 않음" 같은 문구가 잘리면 안 된다).
 */
export function shortTeamName(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return null;
  const head = trimmed.split(TAIL)[0]?.trim() ?? '';
  // 구분자로 시작하는 값(" - 강남")은 줄이면 아무것도 남지 않는다. 그럴 땐 원문을 쓴다.
  return head || trimmed;
}
