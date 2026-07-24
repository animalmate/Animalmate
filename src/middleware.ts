// 요청마다 nonce 를 발급해 CSP 를 붙인다 — script-src 에서 'unsafe-inline' 을 없애기 위한 장치.
//
// 왜 미들웨어인가(07-DECISIONS 10): 정적 헤더로는 nonce 를 매 요청 새로 만들 수 없다.
// nonce 를 쓰면 Next 하이드레이션 인라인 스크립트에 그 nonce 가 붙고, 브라우저는 nonce 없는
// 스크립트(=주입된 XSS)를 거부한다. 챗봇(1D)이 LLM 이 만든 문자열을 처음으로 화면에 렌더링하므로
// 그 전에 이 방어선을 세운다.
//
// 'strict-dynamic': nonce 로 신뢰된 스크립트가 로드하는 스크립트도 신뢰한다(Next 청크 로딩에 필요).
// 이게 켜지면 script-src 의 호스트 허용목록·'unsafe-inline' 은 지원 브라우저에서 무시되므로,
// 'unsafe-inline' 을 아예 넣지 않는다(= DoD "CSP script-src 에 unsafe-inline 없음").
//
// ⚠ style-src 는 'unsafe-inline' 을 유지한다: React 인라인 style 속성과 Next/styled-jsx 가 만드는
//   <style> 때문이고, 스타일 주입은 스크립트 주입과 달리 위험도가 낮다. 이 한계는 07-DECISIONS 16 에 기록.

import { NextResponse, type NextRequest } from 'next/server';

const FONT_CDN = 'https://cdn.jsdelivr.net'; // Pretendard 폰트(globals.css @import)

export function middleware(request: NextRequest): NextResponse {
  // Web Crypto(btoa)만 쓴다 — 미들웨어는 edge 런타임이라 Node Buffer 를 가정하지 않는다.
  const nonce = btoa(crypto.randomUUID());
  const isProd = process.env.NODE_ENV === 'production';

  // dev(HMR)은 eval 을 쓴다 — 개발에서만 허용하고 배포에서는 뺀다.
  const scriptSrc = [`'self'`, `'nonce-${nonce}'`, `'strict-dynamic'`, ...(isProd ? [] : [`'unsafe-eval'`])].join(' ');

  const csp = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline' ${FONT_CDN}`,
    `font-src 'self' data: ${FONT_CDN}`,
    `img-src 'self' data: blob:`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ');

  // 요청 헤더에도 실어 보낸다 — Next 가 이 값을 읽어 자기 스크립트에 nonce 를 붙인다.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('content-security-policy', csp);
  return res;
}

export const config = {
  // 정적 자산·이미지 최적화·파비콘은 제외(HTML·API 응답에만 적용).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|.*\\.png$).*)'],
};
