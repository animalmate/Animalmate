import type { Metadata } from 'next';
import { getPublicNoticeCohort } from '@/recruit/cohorts';
import { resolveApplyForm } from '@/recruit/apply-form';
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
  //
  // **공고 페이지와 같은 기수를 봐야 한다**(getPublicNoticeCohort). 여기만 "최신 기수"로 두면
  // 다음 기수를 만든 순간 공고는 33기를 보여 주는데 지원 버튼은 34기 지원서를 열고, 접수된
  // 지원자가 아무도 안 보는 기수에 쌓인다 — 화면 둘이 갈리는 쪽이 한쪽만 틀린 것보다 나쁘다.
  const cohort = await getPublicNoticeCohort();

  // 지망 팀·선택지·자기소개서 문항 모두 기수 설정에서 온다
  // ("0. 공고·마감 설정"에서 회장단이 편집). 회원 관리의 teams 테이블은 쓰지 않는다 —
  // 그쪽은 기획팀·홍보팀처럼 운영진이 일하는 조직이라 신입 지원자가 고를 대상이 아니다.
  return (
    <PublicRecruitApplyPanel
      cohort={cohort ? { id: cohort.id, label: cohort.label, isClosed: cohort.isClosed } : null}
      form={resolveApplyForm(cohort?.applyForm)}
    />
  );
}
