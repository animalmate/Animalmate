// 면접 접속 링크를 고르고 다듬는 순수 규칙. lookup(지원자 조회)과 면접 진행 콘솔이 같이 쓴다.
// 스펙: docs/09-RECRUIT-DESIGN.md §6-7

/**
 * 개인 링크 → 슬롯(조) 링크 순으로 고른다.
 *
 * 비대면 조는 **방 하나를 하루 종일 쓰므로** 링크를 조 단위로 한 번만 적는다(3번 화면의 조 생성).
 * 개인 링크(`recruit_applicants.interview_link`)는 그 사람만 따로 다른 방을 쓸 때의 예외다.
 * 예전엔 개인 링크만 봤다 — 33기에서 조 링크를 다 적어 뒀는데도 지원자 화면엔 '장소: 비대면
 * (온라인 화상)'까지만 뜨고 정작 들어갈 주소가 안 나왔다(배정된 250명 전원의 개인 링크가 비어 있었다).
 */
export function pickInterviewLink(
  personalLink: string | null | undefined,
  slotLink: string | null | undefined
): string | null {
  return normalizeInterviewLink(personalLink) ?? normalizeInterviewLink(slotLink);
}

/**
 * 붙여 넣은 링크를 브라우저가 따라갈 수 있는 절대 주소로 맞춘다.
 *
 * 운영진은 Meet 주소를 `meet.google.com/abc-defg-hij` 처럼 **스킴 없이** 붙여 넣는 일이 잦다
 * (33기 A조가 그랬다). 그대로 `href` 에 넣으면 브라우저가 상대 경로로 읽어 우리 사이트의
 * `/recruit/meet.google.com/...` 으로 가 버린다 — 링크가 있는데도 못 들어간다.
 *
 * http·https 만 통과시킨다. 링크는 회장단만 적지만, 화면에 그대로 `href` 로 나가는 값이라
 * `javascript:` 같은 스킴이 섞이면 조회 화면이 클릭 한 번에 스크립트를 실행하는 자리가 된다.
 */
export function normalizeInterviewLink(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;

  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) ? value : `https://${value}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url.toString();
}
