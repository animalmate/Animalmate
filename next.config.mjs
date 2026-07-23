/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 품질 게이트는 tsc(typecheck) + vitest 로 강제. 빌드는 lint 로 막지 않는다(ESLint 미구성).
  eslint: { ignoreDuringBuilds: true },
  // service role / DB 접근은 서버 전용. 브라우저 번들에 서버 시크릿이 새지 않도록
  // NEXT_PUBLIC_ 접두사 없는 환경변수는 서버에서만 읽는다(02-TECH-STACK §4).
};

export default nextConfig;
