// 카페 게시판 주소 조립. menuid 하드코딩 금지(레지스트리가 원본)이고 clubid 는 환경변수라,
// 주소를 만드는 규칙은 이 한 곳에만 둔다.
//
// **글 주소는 만들 수 없다.** 카페 글 번호는 등록되는 순간 네이버가 카페 전체 순번으로 매기며,
// 글쓰기 API 에 번호를 지정하거나 조회할 방법이 없다(응답으로만 온다). 그래서 발행 전에 알려 줄 수
// 있는 것은 "그 글이 올라갈 게시판" 까지다.

/** 카페 게시판 주소. menuid 나 clubId 가 없으면 null(주소를 지어내지 않는다). */
export function cafeBoardUrl(menuid: number | null | undefined, clubId: string | null | undefined): string | null {
  const club = clubId?.trim();
  if (menuid == null || !Number.isFinite(menuid) || !club) return null;
  // f-e = 카페 프런트엔드 경로. 모바일에서 열면 카페 앱(설치돼 있으면)이나 모바일 웹으로 넘어간다.
  return `https://cafe.naver.com/f-e/cafes/${club}/menus/${menuid}`;
}
