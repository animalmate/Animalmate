import type { ReactNode } from 'react';
import { CursorDog } from './cursor-dog';
import { Icon } from './icon';
import { PublicNav, PUBLIC_HOME } from './public-nav';
import { ctaSecondary } from './ui';

/**
 * ABOUT · CONTACT 처럼 **모집 공고 옆에 나란히 서는 공개 화면**의 공통 껍데기.
 * (모집 공고 자신은 히어로가 다르다 — 지원 버튼과 기수 딱지가 들어가므로 자기 것을 쓴다.)
 *
 * 아래쪽 "모집 공고 보기" 는 장식이 아니다. 이 화면들은 내비 메뉴로 들어오는 곳이라,
 * 로고 말고는 원래 보러 온 공고로 돌아갈 길이 없다 — 로고가 홈이라는 건 만든 사람만 아는 규칙이다.
 */
export function PublicShell({
  title,
  lead,
  children,
}: {
  title: string;
  /** 제목 아래 한 문단. 없으면 제목만. */
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen font-sans">
      {/* 로그인·가입 화면과 같은 장식(커서 따라다니는 강아지). */}
      <CursorDog />
      <PublicNav />

      <header className="border-b border-cream-200 bg-gradient-to-b from-cream-100 to-cream-25 px-4 py-12 sm:py-16">
        <div className="mx-auto max-w-2xl space-y-4 text-center">
          <img src="/logo.png" alt="애니멀메이트" className="mx-auto h-16 w-16 rounded-full" />
          <h1 className="text-balance text-[26px] font-bold tracking-tight text-ink-900 sm:text-[32px]">
            {title}
          </h1>
          {lead ? <div className="text-[15px] leading-[1.8] text-ink-700">{lead}</div> : null}
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-12 sm:py-16">{children}</div>

      <div className="mx-auto max-w-2xl px-4 pb-16 text-center">
        <a href={PUBLIC_HOME} className={ctaSecondary}>
          <Icon name="megaphone" size={18} />
          모집 공고 보기
        </a>
      </div>
    </main>
  );
}
