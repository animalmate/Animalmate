import { requireBoard } from '@/auth/current-user';
import { ConsoleShell } from '@/components/console-shell';
import { RecruitInterviewAssignPanel } from './panel';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const actor = await requireBoard();
  return (
    <ConsoleShell actor={actor}>
      <RecruitInterviewAssignPanel />
    </ConsoleShell>
  );
}
