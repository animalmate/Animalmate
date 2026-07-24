// 챗봇 운영 — 회장단 전용. 사용량 확인 + 활성/한도 조정.
import { requireBoard } from '@/auth/current-user';
import { ConsoleShell } from '@/components/console-shell';
import { ChatbotAdminPanel } from './panel';

export const dynamic = 'force-dynamic';

export default async function ChatbotAdminPage() {
  const actor = await requireBoard();
  return (
    <ConsoleShell actor={actor}>
      <ChatbotAdminPanel />
    </ConsoleShell>
  );
}
