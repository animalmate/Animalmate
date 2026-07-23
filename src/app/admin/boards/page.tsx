import { requireBoard } from '@/auth/current-user';
import { ConsoleShell } from '@/components/console-shell';
import { BoardsPanel } from './panel';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const actor = await requireBoard();
  return (
    <ConsoleShell actor={actor}>
      <BoardsPanel />
    </ConsoleShell>
  );
}
