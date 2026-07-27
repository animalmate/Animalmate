import type { Metadata } from 'next';
import { PublicRecruitLookupPanel } from './panel';

// 09-RECRUIT-DESIGN §6.7: 지원자 조회 화면은 독립 레이아웃 + noindex.
// 지원자 개인 상태를 다루는 표면이라 검색엔진에 올라가면 안 된다.
export const metadata: Metadata = {
  title: '신입 모집 결과 조회 | 애니멀메이트',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function PublicRecruitLookupPage() {
  return <PublicRecruitLookupPanel />;
}
