// 상태를 바꾸는 API 요청의 출처 검사(CSRF 방어) — 순수 함수. 미들웨어(edge)에서 쓰므로 Node API 를 쓰지 않는다.
//
// 왜 SameSite=Lax 만으로 부족한가(2026-10-17 보안 감사): Lax 는 **다른 사이트**에서 오는 POST 에
// 쿠키를 싣지 않지만, 같은 사이트(eTLD+1 이 같은 다른 서브도메인)에서 오는 요청에는 그대로 싣는다.
// 커스텀 도메인을 붙이면 같은 도메인의 다른 서브도메인이 곧 그 "같은 사이트"다. 게다가 라우트들은
// Content-Type 을 보지 않고 req.json() 을 하므로 text/plain 폼 전송으로도 본문이 그대로 읽힌다.
// 브라우저가 붙이는 Origin·Sec-Fetch-Site 로 "우리 화면에서 보낸 요청인가"를 서버에서 확인한다.
//
// 헤더가 **둘 다 없으면** 통과시킨다. 브라우저는 POST 에 Origin 을 반드시 붙이므로, 둘 다 없는
// 요청은 브라우저가 아니다(스크립트·서버 간 호출) — 그런 요청에는 피해자의 쿠키가 실려 있지 않아
// CSRF 가 성립하지 않는다. 크론(pg_net)은 CRON_SECRET 으로 따로 검증하므로 아예 검사 대상이 아니다.

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** 출처 검사를 하지 않는 경로. 크론은 브라우저가 아니라 pg_net 이 부르고, CRON_SECRET 이 지킨다. */
const EXEMPT_PREFIXES = ['/api/cron/'];

export interface OriginCheckInput {
  method: string;
  pathname: string;
  /** 이 서버의 오리진(예: https://animalmate.vercel.app). 요청 URL 에서 뽑는다. */
  selfOrigin: string;
  origin: string | null;
  secFetchSite: string | null;
}

/** 다른 출처에서 온 상태 변경 요청이면 true(= 막아야 한다). */
export function isCrossOriginWrite(input: OriginCheckInput): boolean {
  if (!UNSAFE_METHODS.has(input.method.toUpperCase())) return false;
  if (!input.pathname.startsWith('/api/')) return false;
  if (EXEMPT_PREFIXES.some((p) => input.pathname.startsWith(p))) return false;

  // Sec-Fetch-Site 가 있으면 그것만으로 판단한다 — 브라우저가 직접 계산해 붙이는 값이고 스크립트가
  // 바꿀 수 없다(forbidden header). 프록시 뒤에서 selfOrigin 이 어긋나도(http/https·내부 호스트)
  // 정상 요청이 막히지 않는다. same-site(같은 도메인의 다른 서브도메인)도 막는다 — 그것이 바로
  // SameSite=Lax 가 못 막는 자리다. 'none' 은 사용자가 직접 연 요청(주소창·북마크)이다.
  if (input.secFetchSite) {
    const v = input.secFetchSite.toLowerCase();
    return v !== 'same-origin' && v !== 'none';
  }
  // Sec-Fetch-Site 를 안 보내는 옛 브라우저는 Origin 으로 본다.
  // 'null' 오리진(샌드박스 iframe·file://)도 우리 화면이 아니다.
  if (input.origin !== null) return input.origin !== input.selfOrigin;
  return false;
}
