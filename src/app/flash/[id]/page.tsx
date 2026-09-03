// 번개 상세 — 세부 내용을 보고, 신청하고, 개최자와 쪽지를 주고받는 곳.
//
// 볼 수 없는 번개는 API 가 404 를 준다(존재 여부도 알려주지 않는다). 그 판단은 서버에 있고
// 이 페이지는 id 를 넘기기만 한다.
import { requireActor } from '@/auth/current-user';
import { ConsoleShell } from '@/components/console-shell';
import { FlashDetailPanel } from './detail';

export const dynamic = 'force-dynamic';

export default async function FlashDetailPage(ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await ctx.params;
  return (
    <ConsoleShell actor={actor}>
      <FlashDetailPanel id={id} me={actor.userId} />
    </ConsoleShell>
  );
}
