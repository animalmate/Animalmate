// 카페 게시판 주소 조립. menuid 하드코딩 금지(레지스트리가 원본)이고 clubid 는 환경변수라,
// 주소를 만드는 규칙은 이 한 곳에만 둔다.
//
// **글 주소는 만들 수 없다.** 카페 글 번호는 등록되는 순간 네이버가 카페 전체 순번으로 매기며,
// 글쓰기 API 에 번호를 지정하거나 조회할 방법이 없다(응답으로만 온다). 그래서 발행 전에 알려 줄 수
// 있는 것은 "그 글이 올라갈 게시판" 까지다.

/**
 * 카페 게시판 주소. menuid 나 clubId 가 없으면 null(주소를 지어내지 않는다).
 *
 * **모바일(`m.` + `ca-fe/web`) 경로를 쓴다.** 이 주소가 실제로 열리는 곳은 단톡방이고, 거기서 누르는
 * 사람은 거의 전부 휴대폰이다. PC 경로(`cafe.naver.com/f-e/...`)를 넣었더니 카카오톡 인앱 브라우저가
 * PC 화면을 그대로 띄워 글씨가 작고 조작이 불편했다(2026-08-04 사용자 확인).
 * PC 에서 열어도 모바일 레이아웃으로 보일 뿐 내용은 같다 — 다수인 쪽에 맞춘다.
 */
export function cafeBoardUrl(menuid: number | null | undefined, clubId: string | null | undefined): string | null {
  const club = clubId?.trim();
  if (menuid == null || !Number.isFinite(menuid) || !club) return null;
  return `https://m.cafe.naver.com/ca-fe/web/cafes/${club}/menus/${menuid}`;
}
