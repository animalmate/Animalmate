import { requireStaff } from '@/auth/current-user';
import { ConsoleShell } from '@/components/console-shell';
import { BatchForm } from './form';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const actor = await requireStaff();
  return (
    <ConsoleShell actor={actor}>
      <BatchForm />
    </ConsoleShell>
  );
}
