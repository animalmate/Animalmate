import { requireStaff } from '@/auth/current-user';
import { canEditRecruitNotice } from '@/auth/permissions';
import { ConsoleShell } from '@/components/console-shell';
import { RecruitInterviewConsolePanel } from './panel';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const actor = await requireStaff();
  // `wide`: 목록과 채점창을 나란히 놓는 화면이라 기본 1000px 로는 왼쪽 목록이 눌린다
  // (자세한 사정은 ConsoleShell 주석 참고).
  return (
    <ConsoleShell actor={actor} wide>
      {/* 0단계(공고) 자물쇠를 풀지 말지는 팀 플래그에 달려 있어 서버에서만 알 수 있다. */}
      <RecruitInterviewConsolePanel role={actor.role} canEditNotice={canEditRecruitNotice(actor)} />
    </ConsoleShell>
  );
}
