import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: '애니멀메이트',
  description: '동아리 운영 자동화 서비스',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-cream-50 font-sans text-ink-700 antialiased">{children}</body>
    </html>
  );
}
