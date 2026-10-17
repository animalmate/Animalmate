import { requireStaff } from '@/auth/current-user';
import { canEditRecruitNotice, canMarkRecruitReview } from '@/auth/permissions';
import { ConsoleShell } from '@/components/console-shell';
import { RecruitReviewPanel } from './panel';

export const dynamic = 'force-dynamic';

export default async function Page() {
  // 최종 검토는 **운영진 전원**이 본다. 결정은 다음 단계(회장단)에서 한다
  // (09-RECRUIT-DESIGN §0 "채점은 운영진, 결정은 회장단").
  //
  // 여기서 쓸 수 있는 것은 **검토 표시**(탈락 / 다른 팀 + 보낼 팀)뿐이고, 표시 자체는
  // **팀장단(position='leader')과 회장단만** 누를 수 있다(결정 171). 일반 팀원은 읽기만 한다 —
  // 표시가 6번 최종 결정의 결과를 그대로 정하기 때문이다(결정 138). 권한은 서버에서 막는다(규칙 #6):
  // `/api/recruit/applicants` 의 `review_mark` 는 `canMarkRecruitReview(actor)` 를 검사한다.
  const actor = await requireStaff();
  return (
    <ConsoleShell actor={actor}>
      {/* 0단계(공고) 자물쇠와 검토 표시 가능 여부는 소속 팀 직함/플래그에 달려 있어 서버에서만 알 수 있다. */}
      <RecruitReviewPanel
        role={actor.role}
        canEditNotice={canEditRecruitNotice(actor)}
        canMark={canMarkRecruitReview(actor)}
      />
    </ConsoleShell>
  );
}
