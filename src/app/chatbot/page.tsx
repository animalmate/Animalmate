// 챗봇 — 활성 멤버십이 있는 로그인 사용자 전원. 서버 게이트(requireActiveActor)만 하고 대화는 클라이언트 패널이 담당.
import { requireActiveActor } from '@/auth/current-user';
import { ConsoleShell } from '@/components/console-shell';
import { ChatbotPanel } from './panel';

export const dynamic = 'force-dynamic';

export default async function ChatbotPage() {
  const actor = await requireActiveActor();
  return (
    <ConsoleShell actor={actor}>
      <ChatbotPanel />
    </ConsoleShell>
  );
}
