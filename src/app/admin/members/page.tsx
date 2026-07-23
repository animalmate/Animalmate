import { requireBoard } from '@/auth/current-user';
import { ConsoleShell } from '@/components/console-shell';
import { MembersPanel } from './panel';

export const dynamic = 'force-dynamic';

// 회원 관리 — 회장단/시스템관리자 전용. requireBoard 가 그 외 역할을 홈으로 리다이렉트(URL 직접 진입 차단).
export default async function Page() {
  const actor = await requireBoard();
  return (
    <ConsoleShell actor={actor}>
      <MembersPanel isSysadmin={actor.role === 'sysadmin'} selfUserId={actor.userId} />
    </ConsoleShell>
  );
}
