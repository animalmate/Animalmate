// 번개 게시판 — **로그인한 전원**(부원 포함). 부원이 신청하는 곳이자 개최를 내는 곳이다.
//
// 화면을 여는 것으로 새로 열리는 것은 없다: 무엇이 보이는지는 서비스의 `visibleFlash` 가
// SQL WHERE 로 가르고(승인 대기·거절 건은 부원 응답에 행 자체가 안 들어온다), 쓰기는
// 전부 API 가 다시 검증한다(규칙 #6 — 버튼을 숨기는 것은 권한이 아니다).
import { requireActor } from '@/auth/current-user';
import { isStaffPlus } from '@/auth/permissions';
import { ConsoleShell } from '@/components/console-shell';
import { FlashBoard } from './board';

export const dynamic = 'force-dynamic';

export default async function FlashPage() {
  const actor = await requireActor();
  return (
    <ConsoleShell actor={actor}>
      <FlashBoard canApprove={isStaffPlus(actor.role)} />
    </ConsoleShell>
  );
}
