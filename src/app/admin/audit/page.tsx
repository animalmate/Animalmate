// 기록(감사 로그) 조회 — 회장단 전용. 규칙 #4 가 남기는 것을 사람이 읽는 자리다.
import { requireBoard } from '@/auth/current-user';
import { ConsoleShell } from '@/components/console-shell';
import { AuditPanel } from './panel';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const actor = await requireBoard();
  return (
    <ConsoleShell actor={actor}>
      <AuditPanel />
    </ConsoleShell>
  );
}
