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

const STAFF_MENU: NavItem[] = [
  { href: '/reservations', label: '예약', icon: 'megaphone' },
  { href: '/templates', label: '템플릿', icon: 'doc' },
  { href: '/reservations/batch', label: '일괄 생성', icon: 'layers' },
];
const BOARD_MENU: NavItem[] = [
  ...STAFF_MENU,
  { href: '/admin/teams', label: '조직', icon: 'users' },
  { href: '/admin/join-codes', label: '가입코드', icon: 'key' },
  { href: '/admin/boards', label: '게시판', icon: 'board' },
];

function menuFor(role: string): NavItem[] {
  if (role === 'board' || role === 'sysadmin') return BOARD_MENU;
  if (role === 'staff') return STAFF_MENU;
  return [];
}

// 현재 경로 → 활성 메뉴 키(가장 구체적인 접두사 우선).
function activeKey(pathname: string): string {
  if (pathname.startsWith('/reservations/batch')) return '/reservations/batch';
  if (pathname.startsWith('/reservations')) return '/reservations';
  if (pathname.startsWith('/templates')) return '/templates';
  if (pathname.startsWith('/admin/teams')) return '/admin/teams';
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
        className={`flex items-center gap-2 rounded-xl font-semibold no-underline transition-colors ${
          big ? 'h-[52px] px-3.5 text-[15px]' : 'h-10 px-3 text-sm'
        } ${isActive ? 'bg-blue-50 text-blue-700' : 'text-ink-700 hover:bg-cream-50'}`}
      >
        <Icon name={m.icon} size={18} />
        {m.label}
      </a>
    );
  };

  return (
    <header className="relative border-b border-ink-200 bg-white">
      <div className="mx-auto flex h-[60px] max-w-[1120px] items-center gap-2.5 px-4">
        <a href="/" className="flex items-center gap-2 no-underline">
          <img src="/logo.png" alt="애니멀메이트" className="h-8 w-8 rounded-full" />
          <strong className="text-[17px] font-bold text-ink-900">애니멀메이트</strong>
        </a>
        {menus.length > 0 ? <nav className="ml-4 hidden gap-0.5 md:flex">{menus.map((m) => link(m))}</nav> : null}
        <span className="flex-1" />
        <RoleBadge role={role} />
        <button onClick={logout} className="hidden items-center gap-1.5 px-1 py-2 text-[13px] text-ink-500 hover:text-ink-700 md:flex">
          <Icon name="logout" size={16} />
          로그아웃
        </button>
        {menus.length > 0 ? (
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="메뉴"
            className="flex h-11 w-11 items-center justify-center text-ink-900 md:hidden"
          >
            <Icon name={open ? 'x' : 'menu'} size={22} />
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="absolute inset-x-0 top-full z-50 flex flex-col gap-0.5 border-b border-ink-200 bg-white p-3 shadow-raised md:hidden">
          {menus.map((m) => link(m, true))}
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
