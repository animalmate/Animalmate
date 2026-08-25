import { requireStaff } from '@/auth/current-user';
import { canEditRecruitNotice } from '@/auth/permissions';
import { ConsoleShell } from '@/components/console-shell';
import { RecruitScreeningPanel } from './panel';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const actor = await requireStaff();
  return (
    <ConsoleShell actor={actor}>
      {/* 0단계(공고) 자물쇠를 풀지 말지는 팀 플래그에 달려 있어 서버에서만 알 수 있다. */}
      <RecruitScreeningPanel role={actor.role} canEditNotice={canEditRecruitNotice(actor)} />
    </ConsoleShell>
  );
}
