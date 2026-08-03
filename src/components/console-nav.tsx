'use client';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { apiPost } from '@/lib/api';
import { Icon } from './icon';
import { RoleBadge } from './ui';

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

// 챗봇은 로그인 사용자 전원(부원 포함).
// 화면 사용법은 각 화면의 "도움말" 버튼(팝업)에 있다 — 메뉴에 통합 가이드를 두지 않는다.
// "체크리스트"는 시기별로 할 일을 적은 회장단 전용 페이지다.
const COMMON_MENU: NavItem[] = [{ href: '/chatbot', label: '챗봇', icon: 'chat' }];
// 순서는 홈 화면 바로가기 카드(`app/page.tsx` STAFF_SHORTCUTS)와 맞춘다 — 두 곳이 어긋나면
// 같은 메뉴를 화면마다 다른 자리에서 찾게 된다(2026-08-03 사용자 지정: 예약·템플릿 다음 일정).
const STAFF_MENU: NavItem[] = [
  ...COMMON_MENU,
  { href: '/reservations', label: '예약', icon: 'megaphone' },
  { href: '/templates', label: '템플릿', icon: 'doc' },
  { href: '/calendar', label: '일정', icon: 'calendar' },
  { href: '/admin/recruit/screening', label: '신입모집', icon: 'userPlus' },
];
// 문서(챗봇 지식베이스)는 회장단·시스템관리자만. 팀 배정은 회원 관리 화면으로 통합(별도 팀 메뉴 없음).
const BOARD_MENU: NavItem[] = [
  ...COMMON_MENU,
  { href: '/guides', label: '체크리스트', icon: 'doc' },
  { href: '/reservations', label: '예약', icon: 'megaphone' },
  { href: '/templates', label: '템플릿', icon: 'doc' },
  { href: '/calendar', label: '일정', icon: 'calendar' },
  { href: '/documents', label: '문서', icon: 'layers' },
  { href: '/admin/members', label: '회원', icon: 'users' },
  { href: '/admin/recruit/upload', label: '신입모집', icon: 'userPlus' },
  { href: '/admin/join-codes', label: '가입코드', icon: 'key' },
  { href: '/admin/boards', label: '게시판', icon: 'board' },
  { href: '/admin/chatbot', label: '챗봇설정', icon: 'info' },
];

function menuFor(role: string): NavItem[] {
  if (role === 'board' || role === 'sysadmin') return BOARD_MENU;
  if (role === 'staff') return STAFF_MENU;
  return COMMON_MENU; // 부원도 챗봇은 보인다
}

// 현재 경로 → 활성 메뉴 키(가장 구체적인 접두사 우선).
function activeKey(pathname: string): string {
  if (pathname.startsWith('/chatbot')) return '/chatbot';
  if (pathname.startsWith('/guides')) return '/guides';
  if (pathname.startsWith('/calendar')) return '/calendar';
  if (pathname.startsWith('/documents')) return '/documents';
  if (pathname.startsWith('/reservations')) return '/reservations';
  if (pathname.startsWith('/templates')) return '/templates';
  if (pathname.startsWith('/profile')) return '/profile';
  if (pathname.startsWith('/admin/recruit')) return '/admin/recruit/upload';
  if (pathname.startsWith('/admin/chatbot')) return '/admin/chatbot';
  if (pathname.startsWith('/admin/members')) return '/admin/members';
  if (pathname.startsWith('/admin/join-codes')) return '/admin/join-codes';
  if (pathname.startsWith('/admin/boards')) return '/admin/boards';
  return '/';
}

export function ConsoleNav({ role }: { role: string }) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  const menus = menuFor(role);
  const active = activeKey(pathname);

  async function logout() {
    await apiPost('/api/auth/logout', {});
    router.push('/login');
    router.refresh();
  }

  const link = (m: NavItem, big = false) => {
    const isActive = m.href === active;
    return (
      <a
        key={m.href}
        href={m.href}
        onClick={() => setOpen(false)}
        className={`flex items-center gap-1.5 rounded-xl font-semibold no-underline transition-colors whitespace-nowrap shrink-0 ${
          big ? 'h-[52px] px-3.5 text-[15px]' : 'h-9 px-2.5 text-xs lg:text-sm lg:px-3'
        } ${isActive ? 'bg-blue-50 text-blue-700' : 'text-ink-700 hover:bg-cream-50'}`}
      >
        <Icon name={m.icon} size={17} />
        {m.label}
      </a>
    );
  };

  return (
    <header className="relative border-b border-ink-200 bg-white">
      {/* 헤더만 본문(1120)보다 넓게 쓴다. 회장단은 메뉴가 10개라 1120 안에 들어가지 않아서,
          좁히면 마지막 메뉴(챗봇설정)가 넓은 화면에서도 잘린다. 본문과 나란히 맞추는 것보다
          메뉴가 다 보이는 편이 낫다 — 로고·본문 시작선은 원래도 정확히 맞지 않았다. */}
      <div className="mx-auto flex h-[60px] max-w-[1400px] items-center gap-2 px-3 sm:px-4">
        <a href="/" className="flex items-center gap-2 no-underline shrink-0 mr-1">
          <img src="/logo.png" alt="애니멀메이트" className="h-8 w-8 rounded-full" />
          <strong className="text-[17px] font-bold text-ink-900 hidden sm:inline">애니멀메이트</strong>
        </a>
        {/* 메뉴 줄은 **줄어들 수 있어야** 한다. `shrink-0` 이면 아무리 좁아도 제 너비를 고집해서
            헤더가 화면을 넘고, 그러면 오른쪽 끝의 `로그아웃` 이 잘린 채 페이지에 가로 스크롤이 생긴다
            (2026-07-31 QA: 회장단 계정 기준 1280px 에서 56px, 1366px 에서 13px 초과 — 노트북에서 흔한 폭이다.
            메뉴가 10개인 회장단만 넘치므로 그동안 안 보였다). `overflow-x-auto` 는 원래 이걸 대비해
            적혀 있었는데 `shrink-0` 이 함께 있어 한 번도 작동하지 않았다 — 줄어들 수 있어야 안에서 스크롤된다. */}
        {menus.length > 0 ? (
          <nav className="hidden min-w-0 gap-0.5 overflow-x-auto md:flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {menus.map((m) => link(m))}
          </nav>
        ) : null}
        <span className="flex-1 min-w-[8px]" />
        <div className="hidden sm:block shrink-0">
          <RoleBadge role={role} />
        </div>
        <a href="/profile" onClick={() => setOpen(false)} className="hidden items-center gap-1 px-1.5 py-2 text-[13px] text-ink-500 no-underline hover:text-ink-700 md:flex whitespace-nowrap shrink-0">
          <Icon name="users" size={16} />
          내 정보
        </a>
        <button onClick={logout} className="hidden items-center gap-1 px-1.5 py-2 text-[13px] text-ink-500 hover:text-ink-700 md:flex whitespace-nowrap shrink-0">
          <Icon name="logout" size={16} />
          로그아웃
        </button>
        {menus.length > 0 ? (
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="메뉴"
            // 아이콘만 있는 토글이라 열림/닫힘이 모양으로만 드러난다 — 보조기기에는 이 속성이 그 정보다.
            aria-expanded={open}
            aria-controls="console-mobile-menu"
            className="flex h-11 w-11 items-center justify-center text-ink-900 md:hidden"
          >
            <Icon name={open ? 'x' : 'menu'} size={22} />
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          id="console-mobile-menu"
          className="absolute inset-x-0 top-full z-50 flex flex-col gap-0.5 border-b border-ink-200 bg-white p-3 shadow-raised md:hidden"
        >
          {menus.map((m) => link(m, true))}
          <a
            href="/profile"
            onClick={() => setOpen(false)}
            className="flex h-[52px] items-center gap-2 rounded-xl px-3.5 text-[15px] font-semibold text-ink-700 no-underline hover:bg-cream-50"
          >
            <Icon name="users" size={18} />
            내 정보
          </a>
          <button
            onClick={logout}
            className="mt-1.5 flex h-[52px] items-center gap-2 border-t border-ink-100 px-3.5 text-[15px] font-semibold text-ink-500"
          >
            <Icon name="logout" size={18} />
            로그아웃
          </button>
        </div>
      ) : null}
    </header>
  );
}
