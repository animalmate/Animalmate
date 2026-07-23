import { requireStaff } from '@/auth/current-user';
import { ConsoleShell } from '@/components/console-shell';
import { EditReservationForm } from './form';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  const { id } = await params;
  return (
    <ConsoleShell actor={actor}>
      <EditReservationForm id={id} />
    </ConsoleShell>
  );
}
