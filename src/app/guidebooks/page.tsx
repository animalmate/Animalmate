// 팀 가이드북 — **보기는 로그인한 전원(부원 포함)**, 올리고 지우는 것은 그 팀 팀장단 + 회장단.
//
// 왜 `/guides` 가 아니라 새 화면인가: `/guides` 는 회장단 전용 체크리스트다(requireBoard).
// 가이드북은 애초에 **부원에게 보여 주려고** 만드는 자료라 그 화면에 둘 수 없다.
//
// 버튼을 그릴지 말지는 서버가 팀마다 판정해 `canManage` 로 내려준다. 그것은 표시용일 뿐이고
// 실제 검증은 API·서비스가 다시 한다(규칙 #6).
import { requireActor } from '@/auth/current-user';
import { ConsoleShell } from '@/components/console-shell';
import { GuidebooksPanel } from './panel';

export const dynamic = 'force-dynamic';

export default async function GuidebooksPage() {
  const actor = await requireActor();
  return (
    <ConsoleShell actor={actor}>
      <GuidebooksPanel />
    </ConsoleShell>
  );
}
