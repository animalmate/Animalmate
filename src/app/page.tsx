import { requireActor } from '@/auth/current-user';
import { ConsoleShell } from '@/components/console-shell';
import { Card } from '@/components/ui';
import { isStaffPlus, isPrivileged } from '@/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const actor = await requireActor();
  const staff = isStaffPlus(actor.role);
  const board = isPrivileged(actor.role);

  return (
    <ConsoleShell actor={actor}>
      <h1 className="mb-4 text-lg font-bold">콘솔</h1>
      {!actor.membershipActive ? (
        <Card className="mb-4">
          <p className="text-sm text-gray-700">
            활성 멤버십이 없습니다. 운영진 지정이 필요하면 회장단에게 문의하세요.
          </p>
        </Card>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {staff ? (
          <>
            <HomeLink href="/reservations" title="예약" desc="봉사 공지 예약 큐 · 작성" />
            <HomeLink href="/templates" title="템플릿" desc="발행 양식 관리" />
            <HomeLink href="/reservations/batch" title="일괄 생성" desc="반복 패턴으로 초안 여러 건" />
          </>
        ) : (
          <Card>
            <p className="text-sm text-gray-700">부원 계정입니다. 관리 메뉴는 운영진부터 표시됩니다.</p>
          </Card>
        )}
        {board ? (
          <>
            <HomeLink href="/admin/teams" title="조직" desc="팀 추가·삭제·활성화" />
            <HomeLink href="/admin/join-codes" title="가입코드" desc="학기 가입코드 발급·재발급" />
            <HomeLink href="/admin/boards" title="게시판" desc="카페 게시판 레지스트리" />
          </>
        ) : null}
      </div>
    </ConsoleShell>
  );
}

function HomeLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <a href={href} className="block">
      <Card className="hover:border-gray-400">
        <div className="font-medium">{title}</div>
        <div className="text-sm text-gray-500">{desc}</div>
      </Card>
    </a>
  );
}
