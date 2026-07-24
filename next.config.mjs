// 보안 헤더 — 모든 응답에 공통 적용.
//
// 가장 큰 이유는 클릭재킹이다. 회원 관리·게시판 레지스트리 같은 회장단 화면이 남의 사이트
// iframe 안에 실릴 수 있으면, 회장단을 유인해 "역할 변경"·"비활성화" 버튼을 대신 누르게 만들 수 있다
// (세션 쿠키는 SameSite=Lax 라 폼 전송 CSRF 는 막히지만, 프레임 안 실제 클릭은 막지 못한다).
// frame-ancestors 'none' + X-Frame-Options 로 프레임 자체를 차단한다.
//
// CSP script-src 에 'unsafe-inline' 이 남아 있는 것은 Next 하이드레이션 인라인 스크립트 때문이다.
// nonce 를 쓰려면 미들웨어가 필요해 지금은 두되, 외부 출처 스크립트·connect 는 전부 막아
// 데이터 유출 경로를 닫는다. 본문은 전부 React 가 이스케이프하며 dangerouslySetInnerHTML 을
// 쓰는 곳이 없다(HTML 주입 싱크 없음).
//
// 폰트(Pretendard)는 jsdelivr CDN 에서 오므로 style-src/font-src 에만 예외를 둔다.
const FONT_CDN = 'https://cdn.jsdelivr.net';

// dev 서버(HMR)는 eval 을 쓴다 — 개발에서만 허용하고 배포 빌드에서는 뺀다.
const scriptSrc = ["'self'", "'unsafe-inline'"];
if (process.env.NODE_ENV !== 'production') scriptSrc.push("'unsafe-eval'");

const CSP = [
  "default-src 'self'",
  `script-src ${scriptSrc.join(' ')}`,
  `style-src 'self' 'unsafe-inline' ${FONT_CDN}`,
  `font-src 'self' data: ${FONT_CDN}`,
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // HTTPS 강제(Vercel 도 붙이지만 커스텀 도메인·프록시에서도 보장되도록 명시).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 품질 게이트는 tsc(typecheck) + vitest 로 강제. 빌드는 lint 로 막지 않는다(ESLint 미구성).
  eslint: { ignoreDuringBuilds: true },
  // service role / DB 접근은 서버 전용. 브라우저 번들에 서버 시크릿이 새지 않도록
  // NEXT_PUBLIC_ 접두사 없는 환경변수는 서버에서만 읽는다(02-TECH-STACK §4).
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
