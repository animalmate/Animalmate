// 문서 관리 — 운영진 이상. 챗봇 지식베이스(RAG) 문서를 만들고 공개 범위를 정한다.
import { requireStaff } from '@/auth/current-user';
import { ConsoleShell } from '@/components/console-shell';
import { DocumentsPanel } from './panel';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  const actor = await requireStaff();
  return (
    <ConsoleShell actor={actor}>
      <DocumentsPanel />
    </ConsoleShell>
  );
}
