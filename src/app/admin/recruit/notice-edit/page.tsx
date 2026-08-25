import { requireNoticeEditor } from '@/auth/current-user';
import { ConsoleShell } from '@/components/console-shell';
import { RecruitNoticeEditPanel } from './panel';

export const dynamic = 'force-dynamic';

export default async function Page() {
  // 회장단 + **공고 편집 권한이 켜진 팀**(홍보팀)만(2026-08-25, 결정 140).
  // 운영진 전원이 아니다 — 예전엔 requireStaff 라 홍보팀이 아닌 운영진도 다 들어왔다(결정 66).
  // 팀 안에서 무엇을 바꿀 수 있는지는 API 라우트가 필드 단위로 다시 가른다.
  const actor = await requireNoticeEditor();
  return (
    <ConsoleShell actor={actor}>
      <RecruitNoticeEditPanel role={actor.role} />
    </ConsoleShell>
  );
}
