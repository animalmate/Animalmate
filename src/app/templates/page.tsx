import { requireStaff } from '@/auth/current-user';
import { isPrivileged } from '@/auth/permissions';
import { ConsoleShell } from '@/components/console-shell';
import { TemplatesPanel } from './panel';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const actor = await requireStaff();
  return (
    <ConsoleShell actor={actor}>
      <TemplatesPanel isBoard={isPrivileged(actor.role)} />
    </ConsoleShell>
  );
}
