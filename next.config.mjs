// 보안 헤더 — 모든 응답에 공통 적용(정적 헤더). nonce 가 필요한 CSP 는 미들웨어가 담당한다
// (src/middleware.ts — 요청마다 nonce 발급). CSP 를 여기 두면 nonce 를 매 요청 새로 만들 수 없다.
//
// 여기 남는 헤더들은 nonce 와 무관하고 정적 자산에도 붙어야 하므로 next.config 에 둔다.
// X-Frame-Options: 클릭재킹 차단(회장단 화면을 iframe 에 실어 대신 클릭시키는 공격). CSP frame-ancestors
// 와 이중으로 건다 — 구형 브라우저는 CSP 를 무시할 수 있어서.
const SECURITY_HEADERS = [
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
