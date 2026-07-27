import { requireActor } from '@/auth/current-user';
import { ConsoleShell } from '@/components/console-shell';
import { guidesFor } from '@/guides/content';
import { GuidesPanel } from './panel';

export const dynamic = 'force-dynamic';

export default async function GuidesPage() {
  const actor = await requireActor();
  // 볼 수 있는 가이드만 서버에서 골라 넘긴다 — 부원의 HTML 에 운영진용 본문이 실려 나가지 않게(규칙 #6).
  return (
    <ConsoleShell actor={actor}>
      <GuidesPanel guides={guidesFor(actor.role)} />
    </ConsoleShell>
  );
}
