import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

const PRETENDARD_CSS =
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css';

export const metadata: Metadata = {
  title: '애니멀메이트',
  description: '동아리 운영 자동화 서비스',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 폰트 CDN 커넥션(DNS+TCP+TLS)을 앱 CSS 받는 동안 미리 열어 둔다. 폰트 파일은 익명
            CORS 요청이라 crossOrigin 이 있어야 같은 커넥션이 재사용된다(없으면 두 번 연다). */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        {/* globals.css 의 @import 를 여기로 옮긴 것 — 이유는 globals.css 상단 주석 참고.
            dynamic-subset 은 @font-face 92개를 unicode-range 로 쪼개 둬서, 브라우저가 화면에
            실제로 쓰인 글자에 해당하는 조각만 받는다(한글 전체 1MB+ 를 받지 않는다). */}
        <link rel="stylesheet" href={PRETENDARD_CSS} />
      </head>
      <body className="min-h-screen bg-cream-50 font-sans text-ink-700 antialiased">{children}</body>
    </html>
  );
}
