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

// ── 공개 화면(모집 공고·ABOUT·CONTACT)의 '활동 사진 → 봉사 기록' ──────────────────────
//
// clubid·menuid 는 카페 주소에 그대로 드러나는 **공개 값**이다(시크릿이 아니다).
// 게시판 레지스트리(boards 테이블)를 거치지 않는 이유: 이 링크는 로그인 없이 열리는 화면에
// 있어서 DB 조회 없이 그려야 하고, 봉사 기록 게시판은 기수와 무관하게 고정이다.
const VOLUNTEER_CLUB_ID = '29850342';
const VOLUNTEER_MENU_ID = 21;

/**
 * 봉사 기록 게시판 주소 — **PC·모바일 양쪽**.
 *
 * 왜 둘 다 필요한가: 네이버는 `/f-e/`(PC 웹 SPA) 주소를 휴대폰에서 열어도 모바일 화면으로
 * 돌려주지 않는다. 상단 메뉴에 PC 주소만 박아 두었더니 휴대폰에서 글씨가 작은 PC 카페가
 * 그대로 떴다(2026-08-29 사용자 확인). 예전 `cafe.naver.com/animalmate2010` 같은 이름 주소는
 * 네이버가 알아서 돌려주지만, 게시판까지 지정하려면 이 경로를 써야 한다.
 *
 * 어느 쪽을 쓸지는 **화면이 기기를 보고 고른다**(public-nav) — 여기서는 정하지 않는다.
 * `cafeBoardUrl`(공지 발행용)이 항상 모바일인 것과 다른 사정이다: 그 주소가 열리는 곳은
 * 단톡방이라 누르는 사람이 거의 전부 휴대폰이지만, 이 메뉴는 PC 로도 똑같이 들어온다.
 */
export const CAFE_VOLUNTEER_BOARD = {
  pc: `https://cafe.naver.com/f-e/cafes/${VOLUNTEER_CLUB_ID}/menus/${VOLUNTEER_MENU_ID}`,
  mobile: `https://m.cafe.naver.com/ca-fe/web/cafes/${VOLUNTEER_CLUB_ID}/menus/${VOLUNTEER_MENU_ID}`,
} as const;

/**
 * UA 문자열이 휴대폰·태블릿인가(순수 — 브라우저 API 를 읽지 않는다).
 *
 * 화면 **폭**으로 판단하지 않는 이유: PC 브라우저 창을 좁혀도 모바일 카페로 보내면 안 된다.
 * 우리가 알고 싶은 것은 "창이 좁은가"가 아니라 "이 사람이 휴대폰을 쓰는가"다.
 *
 * ⚠ 최신 iPad(iPadOS)는 UA 에 `Macintosh` 를 실어 여기서 PC 로 잡힌다. 그대로 둔다 —
 * 화면이 넓어 PC 카페가 오히려 읽기 낫고, 이 값 하나 때문에 터치 개수까지 뒤지면
 * 판정이 브라우저 API 에 묶여 테스트할 수 없게 된다.
 */
export function isMobileUserAgent(ua: string | null | undefined): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(String(ua ?? ''));
}
