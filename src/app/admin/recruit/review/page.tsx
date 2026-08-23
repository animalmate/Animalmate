import { requireStaff } from '@/auth/current-user';
import { ConsoleShell } from '@/components/console-shell';
import { RecruitReviewPanel } from './panel';

export const dynamic = 'force-dynamic';

export default async function Page() {
  // 최종 검토는 **운영진 전원**이 본다. 결정은 다음 단계(회장단)에서 한다 —
  // 이 화면에는 상태를 바꾸는 버튼이 하나도 없다(09-RECRUIT-DESIGN §0 "채점은 운영진, 결정은 회장단").
  const actor = await requireStaff();
  return (
    <ConsoleShell actor={actor}>
      <RecruitReviewPanel role={actor.role} />
    </ConsoleShell>
  );
}
