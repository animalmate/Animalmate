import { requireActor } from '@/auth/current-user';
import { ConsoleShell } from '@/components/console-shell';
import { Banner, Card } from '@/components/ui';
import { Icon } from '@/components/icon';
import { isStaffPlus, isPrivileged } from '@/auth/permissions';

export const dynamic = 'force-dynamic';

interface Shortcut {
  href: string;
  label: string;
  desc: string;
  icon: string;
}

const STAFF_SHORTCUTS: Shortcut[] = [
  { href: '/reservations', label: '예약', desc: '공지 예약을 만들고 관리해요', icon: 'megaphone' },
  { href: '/templates', label: '템플릿', desc: '자주 쓰는 양식을 저장해요', icon: 'doc' },
  { href: '/reservations/batch', label: '일괄 생성', desc: '정기 봉사를 한 번에 예약해요', icon: 'layers' },
];
const BOARD_SHORTCUTS: Shortcut[] = [
  { href: '/admin/teams', label: '조직', desc: '팀과 팀장단을 관리해요', icon: 'users' },
  { href: '/admin/join-codes', label: '가입코드', desc: '학기별 가입코드를 발급해요', icon: 'key' },
  { href: '/admin/boards', label: '게시판', desc: '카페 게시판을 연결해요', icon: 'board' },
];

export default async function HomePage() {
  const actor = await requireActor();
  const staff = isStaffPlus(actor.role);
  const shortcuts = [...(staff ? STAFF_SHORTCUTS : []), ...(isPrivileged(actor.role) ? BOARD_SHORTCUTS : [])];

  return (
    <ConsoleShell actor={actor}>
      <div className="space-y-5">
        {!actor.membershipActive ? (
          <Banner kind="warning" title="이번 학기 멤버십이 아직 활성화되지 않았어요">
            운영진 지정이 필요하면 회장단에게 문의해 주세요.
          </Banner>
        ) : null}

        <div>
          <h1 className="text-[28px] font-bold text-ink-900">콘솔</h1>
          <p className="mt-1.5 text-[15px] text-ink-500">
            {staff ? '오늘도 아이들을 위해 한 걸음 — 무엇부터 할까요?' : '동아리 소식은 네이버 카페에서 확인할 수 있어요.'}
          </p>
        </div>

        {shortcuts.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shortcuts.map((s) => (
              <a key={s.href} href={s.href} className="no-underline">
                <Card className="flex min-h-[84px] items-center gap-3.5 transition-colors hover:border-blue-300">
                  <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[14px] bg-blue-50 text-blue-600">
                    <Icon name={s.icon} size={22} />
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-base font-semibold text-ink-900">{s.label}</strong>
                    <span className="text-[13px] text-ink-500">{s.desc}</span>
                  </span>
                  <Icon name="chevronRight" size={18} className="ml-auto text-ink-300" />
                </Card>
              </a>
            ))}
          </div>
        ) : (
          <Card className="flex items-start gap-3.5">
            <img src="/logo-shapes.png" alt="" className="h-[72px] w-[72px] shrink-0 object-contain" />
            <div>
              <h3 className="mb-1 text-base font-semibold text-ink-900">부원 전용 안내</h3>
              <p className="text-[15px] leading-relaxed text-ink-700">
                봉사 신청과 공지는 네이버 카페에서 진행돼요. 관리 메뉴는 운영진부터 표시됩니다.
              </p>
            </div>
          </Card>
        )}
      </div>
    </ConsoleShell>
  );
}
