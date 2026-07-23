/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // service role / DB 접근은 서버 전용. 브라우저 번들에 서버 시크릿이 새지 않도록
  // NEXT_PUBLIC_ 접두사 없는 환경변수는 서버에서만 읽는다(02-TECH-STACK §4).
};

export default nextConfig;
