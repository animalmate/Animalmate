// 일정(캘린더) — 조회는 운영진 이상, 등록·수정은 회장단·시스템관리자.
// 부원은 이 화면을 보지 않고 챗봇으로 묻는다(부원 공개 일정은 챗봇이 tool 로 읽어 답한다).
import { requireStaff } from '@/auth/current-user';
import { isPrivileged } from '@/auth/permissions';
import { ConsoleShell } from '@/components/console-shell';
import { CalendarPanel } from './panel';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const actor = await requireStaff();
  // 버튼을 숨기는 것은 권한이 아니다(규칙 #6) — 실제 검증은 API·서비스가 한다. 이건 표시용일 뿐이다.
  return (
    <ConsoleShell actor={actor}>
      <CalendarPanel canEdit={isPrivileged(actor.role)} />
    </ConsoleShell>
  );
}
