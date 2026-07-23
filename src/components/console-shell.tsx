// 콘솔 공통 셸 — 상단 네비(역할별 메뉴·역할 배지·로그아웃) + 콘텐츠 컨테이너. 모바일 우선.
import type { ReactNode } from 'react';
import type { Actor } from '@/auth/permissions';
import { ConsoleNav } from './console-nav';

export function ConsoleShell({ actor, children }: { actor: Actor; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-cream-50">
      <ConsoleNav role={actor.role} />
      <main className="mx-auto w-full max-w-[1000px] px-4 pb-14 pt-6 sm:px-6">{children}</main>
    </div>
  );
}

// 화면 제목 행: 제목 + 우측 액션.
export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <h1 className="text-[22px] font-bold text-ink-900">{children}</h1>
      {action}
    </div>
  );
}
