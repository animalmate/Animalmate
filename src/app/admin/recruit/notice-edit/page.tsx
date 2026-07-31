import { requireBoard } from '@/auth/current-user';
import { ConsoleShell } from '@/components/console-shell';
import { RecruitNoticeEditPanel } from './panel';

export const dynamic = 'force-dynamic';

export default async function Page() {
  // 회장단 전용(2026-07-31, 결정 66). 제목이 "(홍보팀·회장단)"인데 운영진이면 누구나 들어와졌다.
  const actor = await requireBoard();
  return (
    <ConsoleShell actor={actor}>
      <RecruitNoticeEditPanel role={actor.role} />
    </ConsoleShell>
  );
}
