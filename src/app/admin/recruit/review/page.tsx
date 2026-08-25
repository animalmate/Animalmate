import { requireStaff } from '@/auth/current-user';
import { canEditRecruitNotice } from '@/auth/permissions';
import { ConsoleShell } from '@/components/console-shell';
import { RecruitReviewPanel } from './panel';

export const dynamic = 'force-dynamic';

export default async function Page() {
  // 최종 검토는 **운영진 전원**이 본다. 결정은 다음 단계(회장단)에서 한다
  // (09-RECRUIT-DESIGN §0 "채점은 운영진, 결정은 회장단").
  //
  // 여기서 쓸 수 있는 것은 **검토 표시**(탈락 / 다른 팀 + 보낼 팀)뿐이다. 지원자 상태도 배정 팀도
  // 건드리지 않는다 — 팀장단이 회의에서 낸 의견을 6번 화면까지 들고 가기 위한 값이고,
  // 합격 여부는 여전히 회장단이 정한다(2026-08-24). 권한은 서버에서 막는다(규칙 #6):
  // `/api/recruit/applicants` 의 `review_mark` 는 운영진 이상만 받는다.
  const actor = await requireStaff();
  return (
    <ConsoleShell actor={actor}>
      {/* 0단계(공고) 자물쇠를 풀지 말지는 팀 플래그에 달려 있어 서버에서만 알 수 있다. */}
      <RecruitReviewPanel role={actor.role} canEditNotice={canEditRecruitNotice(actor)} />
    </ConsoleShell>
  );
}
