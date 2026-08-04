// 캘린더 — **조회는 로그인한 전원(부원 포함)**, 등록·수정은 회장단·시스템관리자.
//
// 부원에게 연 이유(2026-08-04 사용자 결정, 결정 89): 쓰기는 이미 `schedule.manage` 로 잠겨 있고
// 보이는 범위는 visibility 가 **SQL WHERE 에서** 가른다(부원 = member 등급만). 즉 화면을 여는 것으로
// 새로 열리는 것이 없다. 챗봇이 답하는 것과 별개로 "이번 달에 뭐가 있나"는 달력으로 훑는 편이 빠르다.
import { requireActor } from '@/auth/current-user';
import { isPrivileged, isStaffPlus } from '@/auth/permissions';
import { ConsoleShell } from '@/components/console-shell';
import { CalendarPanel } from './panel';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const actor = await requireActor();
  // 버튼을 숨기는 것은 권한이 아니다(규칙 #6) — 실제 검증은 API·서비스가 한다. 이건 표시용일 뿐이다.
  return (
    <ConsoleShell actor={actor}>
      <CalendarPanel canEdit={isPrivileged(actor.role)} manager={isStaffPlus(actor.role)} />
    </ConsoleShell>
  );
}
