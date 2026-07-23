// 콘솔 공용 셸 — 역할별 메뉴 + 상단바. 모바일 우선(팀장단은 폰 사용).
import type { ReactNode } from 'react';
import type { Actor, Role } from '@/auth/permissions';
import { LogoutButton } from './logout-button';

const ROLE_LABEL: Record<Role, string> = {
  member: '부원',
  staff: '운영진',
  board: '회장단',
  sysadmin: '시스템관리자',
};

interface NavItem {
  href: string;
  label: string;
}

function menuFor(role: Role): NavItem[] {
  const staffPlus: NavItem[] = [
    { href: '/reservations', label: '예약' },
    { href: '/templates', label: '템플릿' },
  ];
  const boardOnly: NavItem[] = [
    { href: '/admin/join-codes', label: '가입코드' },
    { href: '/admin/boards', label: '게시판' },
  ];
  if (role === 'board' || role === 'sysadmin') return [...staffPlus, ...boardOnly];
  if (role === 'staff') return staffPlus;
  return []; // 부원: 관리 메뉴 없음
}

export function ConsoleShell({ actor, children }: { actor: Actor; children: ReactNode }) {
  const items = menuFor(actor.role);
  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 p-3">
          <a href="/" className="font-bold">
            애니멀메이트
          </a>
          <nav className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {items.map((i) => (
              <a key={i.href} href={i.href} className="text-gray-700 hover:underline">
                {i.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-gray-500">
            <span>{ROLE_LABEL[actor.role]}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl p-4">{children}</main>
    </div>
  );
}
