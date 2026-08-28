'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from './icon';

/**
 * 공개 화면(모집 공고 · ABOUT · CONTACT) 공통 상단 메뉴.
 *
 * 로그인 없이 들어오는 사람이 보는 **동아리 표면 전체**를 잇는다. 콘솔 내비(console-nav)와 달리
 * 랜딩 페이지 방식이다 — 메뉴를 누르면 **각자의 화면으로 이동한다**(같은 페이지 안 앵커가 아니다).
 *
 * 활동 사진만 드롭다운인 이유: 우리가 사진을 다시 호스팅하지 않고, 봉사 기록과 행사 기록이
 * 서로 다른 곳(네이버 카페 / 인스타그램)에 쌓여 있어 한 링크로 묶을 수 없다.
 */

/** 공개 화면의 첫 문. 로고를 누르면 여기로 돌아온다. */
export const PUBLIC_HOME = '/recruit/notice';

const CAFE_VOLUNTEER_URL = 'https://cafe.naver.com/f-e/cafes/29850342/menus/21';
const INSTAGRAM_URL = 'https://www.instagram.com/animalmate_/';

const PAGE_LINKS = [
  { href: '/about', label: 'ABOUT' },
  { href: '/contact', label: 'CONTACT' },
];

const PHOTO_LINKS = [
  { href: CAFE_VOLUNTEER_URL, label: '봉사 기록', hint: '네이버 카페' },
  { href: INSTAGRAM_URL, label: '행사 기록', hint: '인스타그램' },
];

const linkBase =
  'flex min-h-tap items-center gap-1 rounded-xl px-2.5 py-2 text-[13px] font-bold tracking-wide no-underline transition-colors hover:bg-cream-100 hover:text-ink-900 hover:no-underline sm:px-3 sm:text-sm';
// 현재 화면은 색을 채우지 않고 밑줄로 표시한다 — 알약 배경을 깔면 세 칸 중 하나만 도드라져
// 나머지가 비활성처럼 보인다(콘솔 내비에서 같은 이유로 테두리 방식을 쓴다).
const linkIdle = `${linkBase} text-ink-700`;
const linkActive = `${linkBase} text-ink-900 underline decoration-coral-500 decoration-2 underline-offset-[6px]`;

export function PublicNav() {
  const pathname = usePathname();
  const [openPhotos, setOpenPhotos] = useState(false);
  const photosRef = useRef<HTMLDivElement>(null);

  // 바깥을 누르거나 Esc 를 누르면 닫는다. 드롭다운을 열어 둔 채로 페이지를 스크롤하면
  // 메뉴만 화면에 떠 있어 무엇에 딸린 메뉴인지 알 수 없다.
  useEffect(() => {
    if (!openPhotos) return;
    const onDown = (e: MouseEvent) => {
      if (!photosRef.current?.contains(e.target as Node)) setOpenPhotos(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenPhotos(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openPhotos]);

  return (
    <nav
      aria-label="동아리 소개"
      className="sticky top-0 z-40 border-b border-cream-200 bg-cream-25/90 backdrop-blur"
    >
      {/* 폭·좌우 여백을 아래 본문(max-w-2xl px-4)과 맞춘다 — 어긋나면 로고가 본문 밖으로 튀어나온다. */}
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-2 px-4 sm:h-16">
        <a
          href={PUBLIC_HOME}
          className="flex min-h-tap shrink-0 items-center gap-2 rounded-xl px-1 no-underline hover:no-underline"
        >
          <img src="/logo.png" alt="" className="h-8 w-8 rounded-full" />
          {/* 좁은 화면에서는 로고만 남긴다 — 이름까지 두면 메뉴 3개가 접힌다(360px 기준).
              지우지 않고 sr-only 로 두는 이유: 로고 alt 가 비어 있어 이걸 숨기면 이 링크에
              읽어 줄 이름이 하나도 남지 않는다. */}
          <span className="sr-only text-[15px] font-bold text-ink-900 sm:not-sr-only">
            애니멀메이트
          </span>
        </a>

        <div className="flex items-center gap-0.5 sm:gap-1">
          {PAGE_LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <a
                key={l.href}
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={active ? linkActive : linkIdle}
              >
                {l.label}
              </a>
            );
          })}

          <div ref={photosRef} className="relative">
            <button
              type="button"
              aria-expanded={openPhotos}
              aria-haspopup="menu"
              onClick={() => setOpenPhotos((v) => !v)}
              className={linkIdle}
            >
              활동 사진
              <Icon
                name="chevronDown"
                size={14}
                className={`transition-transform ${openPhotos ? 'rotate-180' : ''}`}
              />
            </button>

            {openPhotos ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-2xl border border-cream-200 bg-white p-1.5 shadow-raised"
              >
                {PHOTO_LINKS.map((l) => (
                  <a
                    key={l.href}
                    role="menuitem"
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setOpenPhotos(false)}
                    className="flex min-h-tap items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-ink-700 no-underline transition-colors hover:bg-cream-100 hover:text-ink-900 hover:no-underline"
                  >
                    <span>
                      {l.label}
                      <span className="ml-1.5 text-[12px] font-medium text-ink-400">{l.hint}</span>
                    </span>
                    <Icon name="external" size={14} className="text-ink-400" />
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </nav>
  );
}
