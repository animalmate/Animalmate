// 콘솔 공통 셸 — 상단 네비(역할별 메뉴·역할 배지·로그아웃) + 콘텐츠 컨테이너. 모바일 우선.
import type { ReactNode } from 'react';
import type { Actor } from '@/auth/permissions';
import { ConsoleNav } from './console-nav';

export function ConsoleShell({ actor, children }: { actor: Actor; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <ConsoleNav role={actor.role} />
      <main className="mx-auto w-full max-w-[1000px] px-4 pb-14 pt-6 sm:px-6">{children}</main>
    </div>
  );
}
