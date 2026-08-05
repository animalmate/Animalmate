// 콘솔 공통 셸 — 상단 네비(역할별 메뉴·역할 배지·로그아웃) + 콘텐츠 컨테이너. 모바일 우선.
import type { ReactNode } from 'react';
import type { Actor } from '@/auth/permissions';
import { ConsoleNav } from './console-nav';

/**
 * `wide` 는 **나란히 놓고 봐야 하는 화면**에만 준다(면접 콘솔처럼 목록·작업창 2열).
 *
 * 기본 1000px 은 글을 읽고 폼을 채우는 화면에 맞춘 폭이다 — 한 줄이 그보다 길면 눈이 다음 줄
 * 첫머리를 놓친다. 하지만 2열 콘솔에서는 같은 1000px 이 왼쪽 목록을 310px 로 눌러 버린다.
 * 헤더가 이미 1400px 을 쓰므로(메뉴 11개가 들어가야 한다) 넓은 화면은 거기에 맞춰 시작선을 맞춘다.
 */
export function ConsoleShell({ actor, children, wide = false }: { actor: Actor; children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col">
      <ConsoleNav role={actor.role} />
      <main className={`mx-auto w-full px-4 pb-14 pt-6 sm:px-6 ${wide ? 'max-w-[1400px]' : 'max-w-[1000px]'}`}>
        {children}
      </main>
    </div>
  );
}
