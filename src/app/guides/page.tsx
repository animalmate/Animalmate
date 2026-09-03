import { requireBoard } from '@/auth/current-user';
import { ConsoleShell } from '@/components/console-shell';
import { Card, InfoText } from '@/components/ui';
import { Markdown } from '@/components/markdown';
import { BOARD_CHECKLIST } from '@/guides/content';
import { DriveLinkPanel } from './drive-link-panel';
import { getHomeLinks } from '@/org/links';
import { db } from '@/db/client';

export const dynamic = 'force-dynamic';

/**
 * 회장단 체크리스트 — 화면별 도움말(팝업)로는 담기 어려운 **시기별** 이야기만 모아 둔 페이지.
 * 각 화면에서 뭘 누르는지는 그 화면의 도움말 버튼에 있다.
 */
export default async function GuidesPage() {
  const actor = await requireBoard();
  const links = await getHomeLinks(db);

  return (
    <ConsoleShell actor={actor}>
      <div className="mx-auto max-w-[760px] space-y-4">
        <div>
          <h1 className="text-[22px] font-bold text-ink-900">{BOARD_CHECKLIST.title}</h1>
          <InfoText>{BOARD_CHECKLIST.summary}</InfoText>
        </div>
        {/* 기수마다 바뀌는 값이라 체크리스트와 같은 자리에 둔다 — 학기 초에 이 화면을 훑기 때문. */}
        <DriveLinkPanel initial={links} />
        <Card className="p-5 sm:p-6">
          <Markdown variant="doc">{BOARD_CHECKLIST.body}</Markdown>
        </Card>
      </div>
    </ConsoleShell>
  );
}
