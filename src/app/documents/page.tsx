// 문서 관리 — 회장단·시스템관리자 전용. 챗봇 지식베이스(RAG) 문서를 만들고 공개 범위를 정한다.
import { requireBoard } from '@/auth/current-user';
import { ConsoleShell } from '@/components/console-shell';
import { DocumentsPanel } from './panel';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  const actor = await requireBoard();
  return (
    <ConsoleShell actor={actor}>
      <DocumentsPanel />
    </ConsoleShell>
  );
}
