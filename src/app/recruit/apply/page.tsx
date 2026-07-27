import type { Metadata } from 'next';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { teams } from '@/db/schema';
import { listCohorts } from '@/recruit/cohorts';
import { PublicRecruitApplyPanel } from './panel';

export const dynamic = 'force-dynamic';

// 지원서 작성 화면은 개인정보를 입력받는 표면이라 색인 대상이 아니다.
// (공개 홍보용 페이지는 /recruit/notice 쪽이다.)
export const metadata: Metadata = {
  title: '신입 부원 지원서 작성 | 애니멀메이트',
  robots: { index: false, follow: false },
};

export default async function PublicRecruitApplyPage() {
  // 기수·마감 여부는 서버에서 미리 확정해 넘긴다 — 예전처럼 로딩 화면이 깜빡이지 않는다.
  const cohort = (await listCohorts())[0] ?? null;

  // 지망 팀 목록도 서버에서 함께 넘긴다. 이 화면은 비로그인이라 운영진용 팀 API 를 부를 수 없고,
  // 목록을 코드에 박아 두면 실제 팀(teams 테이블)과 어긋난다 — 예전에 "봉사 1팀"이 그랬다.
  const teamRows = await db
    .select({ name: teams.name })
    .from(teams)
    .where(eq(teams.isActive, true))
    .orderBy(asc(teams.name));

  return (
    <PublicRecruitApplyPanel
      cohort={cohort ? { id: cohort.id, label: cohort.label, isClosed: cohort.isClosed } : null}
      teams={teamRows.map((t) => t.name)}
    />
  );
}
