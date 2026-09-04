'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { apiPost } from '@/lib/api';
import { Icon } from './icon';
import { RoleBadge } from './ui';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  /**
   * 활성 표시를 판정할 키(기본값 = href).
   *
   * 신입 모집은 역할마다 **첫 화면이 다르다**(운영진은 서류 심사, 회장단은 공고 설정). href 로만
   * 판정하면 운영진이 모집 화면에 들어가 있어도 메뉴에 불이 안 들어온다 — 실제로 그랬다.
   */
  match?: string;
}

// 챗봇은 로그인 사용자 전원(부원 포함).
// 화면 사용법은 각 화면의 "도움말" 버튼(팝업)에 있다 — 메뉴에 통합 가이드를 두지 않는다.
const COMMON_MENU: NavItem[] = [{ href: '/chatbot', label: '챗봇', icon: 'chat' }];
// 부원 메뉴 = 챗봇 + 캘린더(2026-08-04, 결정 89). 캘린더를 COMMON 에 넣지 않는 이유는
// 운영진·회장단 메뉴 순서가 예약·템플릿 다음이어야 하기 때문이다(홈 카드 순서와 맞춘다).
const MEMBER_MENU: NavItem[] = [
  ...COMMON_MENU,
  // 번개는 부원이 실제로 **하는** 일이라(신청·개최) 챗봇 바로 다음에 둔다.
  { href: '/flash', label: '번개', icon: 'zap' },
  { href: '/calendar', label: '캘린더', icon: 'calendar' },
  // 가이드북은 부원이 **보는 쪽**이 주 용도라 부원 메뉴에도 둔다(올리는 것은 팀장단·회장단).
  { href: '/guidebooks', label: '가이드북', icon: 'heart' },
];
// 순서는 홈 화면 바로가기 카드(`app/page.tsx` STAFF_SHORTCUTS)와 맞춘다 — 두 곳이 어긋나면
// 같은 메뉴를 화면마다 다른 자리에서 찾게 된다(2026-08-03 사용자 지정: 예약·템플릿 다음 일정).
const STAFF_MENU: NavItem[] = [
  ...COMMON_MENU,
  { href: '/reservations', label: '예약', icon: 'megaphone' },
  { href: '/templates', label: '템플릿', icon: 'doc' },
  { href: '/calendar', label: '캘린더', icon: 'calendar' },
  { href: '/flash', label: '번개', icon: 'zap' },
  { href: '/guidebooks', label: '가이드북', icon: 'heart' },
  { href: '/admin/recruit/screening', label: '신입모집', icon: 'userPlus', match: '/admin/recruit' },
];
/**
 * 회장단 상시 메뉴 = **운영진 메뉴 + 회원**. 나머지 회장단 전용 화면은 아래 `BOARD_MANAGE`
 * 드롭다운으로 내렸다(2026-09-04).
 *
 * 그전까지는 14개가 한 줄에 있었다. 상한을 1400→1560 으로 올려 13개를 겨우 맞춰 놨는데 `기록` 이
 * 붙으면서 다시 넘쳤고, 1280·1366·1440(노트북에 흔한 폭)에서는 상한을 아무리 올려도 못 담는다.
 * 문제는 폭이 아니라 칸 수였다 — 임기 중 한두 번 여는 `게시판`·`챗봇설정` 이 매주 쓰는 `예약` 과
 * 같은 크기로 같은 줄에 서 있었다.
 *
 * ⚠ **상시 메뉴는 8칸이 상한이다.** 회장단 화면을 새로 만들면 여기가 아니라 `BOARD_MANAGE` 에
 * 넣는다. 8칸을 넘겨야 할 이유가 생기면 넘치는 폭을 먼저 실측할 것 — 옛 주석은 "메뉴가 다 보인다"고
 * 적어 뒀지만 실측하면 아니었다.
 */
const BOARD_MENU: NavItem[] = [
  ...COMMON_MENU,
  { href: '/reservations', label: '예약', icon: 'megaphone' },
  { href: '/templates', label: '템플릿', icon: 'doc' },
  { href: '/calendar', label: '캘린더', icon: 'calendar' },
  { href: '/flash', label: '번개', icon: 'zap' },
  { href: '/guidebooks', label: '가이드북', icon: 'heart' },
  // 팀 배정은 회원 관리 화면으로 통합(별도 팀 메뉴 없음).
  { href: '/admin/members', label: '회원', icon: 'users' },
  { href: '/admin/recruit/notice-edit', label: '신입모집', icon: 'userPlus', match: '/admin/recruit' },
];
/**
 * 회장단 "관리" 드롭다운 — 학기에 한두 번, 또는 사고가 났을 때만 여는 화면들.
 * 문서(챗봇 지식베이스)는 회장단·시스템관리자만 본다. "체크리스트"는 시기별 할 일을 적은 화면이다.
 */
const BOARD_MANAGE: NavItem[] = [
  { href: '/documents', label: '문서', icon: 'layers' },
  { href: '/admin/join-codes', label: '가입코드', icon: 'key' },
  { href: '/admin/boards', label: '게시판', icon: 'board' },
  { href: '/admin/chatbot', label: '챗봇설정', icon: 'info' },
  // 감사 기록 조회(2026-08-28 신설). 사고를 조사할 때만 여는 화면이지만 **회장단이 직접 열 수
  // 있어야** 한다 — 그전까지 읽는 수단이 `psql` 뿐이라, 규칙 #4 가 남기라고 한 기록을 정작
  // 남긴 목적대로 쓸 사람이 못 보고 있었다.
  { href: '/admin/audit', label: '기록', icon: 'layers' },
  { href: '/guides', label: '체크리스트', icon: 'doc' },
];
// 지금 화면이 드롭다운 **안쪽**인지 판정한다 — 그래야 접힌 화면에 들어가 있을 때 `관리` 버튼에
// 불이 들어온다. 접힌 메뉴는 열기 전까지 보이지 않으므로, 버튼이 대신 알려주지 않으면 지금 어디에
// 있는지 화면 어디에도 표시가 없다.
const MANAGE_KEYS = new Set(BOARD_MANAGE.map((m) => m.match ?? m.href));

function isBoard(role: string): boolean {
  return role === 'board' || role === 'sysadmin';
}
function menuFor(role: string): NavItem[] {
  if (isBoard(role)) return BOARD_MENU;
  if (role === 'staff') return STAFF_MENU;
  return MEMBER_MENU; // 부원은 챗봇 + 번개 + 캘린더 + 가이드북
}
function manageFor(role: string): NavItem[] {
  return isBoard(role) ? BOARD_MANAGE : [];
}

// 현재 경로 → 활성 메뉴 키(가장 구체적인 접두사 우선).
function activeKey(pathname: string): string {
  if (pathname.startsWith('/chatbot')) return '/chatbot';
  if (pathname.startsWith('/guides')) return '/guides';
  if (pathname.startsWith('/calendar')) return '/calendar';
  if (pathname.startsWith('/flash')) return '/flash';
  if (pathname.startsWith('/guidebooks')) return '/guidebooks';
  if (pathname.startsWith('/documents')) return '/documents';
  if (pathname.startsWith('/reservations')) return '/reservations';
  if (pathname.startsWith('/templates')) return '/templates';
  if (pathname.startsWith('/profile')) return '/profile';
  if (pathname.startsWith('/admin/recruit')) return '/admin/recruit';
  if (pathname.startsWith('/admin/chatbot')) return '/admin/chatbot';
  if (pathname.startsWith('/admin/members')) return '/admin/members';
  if (pathname.startsWith('/admin/join-codes')) return '/admin/join-codes';
  if (pathname.startsWith('/admin/boards')) return '/admin/boards';
  if (pathname.startsWith('/admin/audit')) return '/admin/audit';
  return '/';
}

export function ConsoleNav({ role }: { role: string }) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const manageRef = useRef<HTMLDivElement | null>(null);
  const manageBtnRef = useRef<HTMLButtonElement | null>(null);
  const menus = menuFor(role);
  const manage = manageFor(role);
  const active = activeKey(pathname);
  const manageActive = MANAGE_KEYS.has(active);

  // 드롭다운은 바깥을 누르거나 Esc 로 닫힌다. Esc 로 닫을 때는 초점을 버튼으로 돌려준다 —
  // 안 그러면 키보드 사용자의 초점이 사라진 패널에 남아 다음 Tab 이 어디로 갈지 알 수 없다.
  useEffect(() => {
    if (!manageOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!manageRef.current?.contains(e.target as Node)) setManageOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setManageOpen(false);
      manageBtnRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [manageOpen]);

  async function logout() {
    await apiPost('/api/auth/logout', {});
    router.push('/login');
    router.refresh();
  }

  const closeAll = () => {
    setOpen(false);
    setManageOpen(false);
  };

  // top=헤더 한 줄, panel=관리 드롭다운 안, drawer=모바일 서랍.
  const link = (m: NavItem, variant: 'top' | 'panel' | 'drawer' = 'top') => {
    const isActive = (m.match ?? m.href) === active;
    const shape =
      variant === 'top'
        ? 'h-9 px-2.5 text-xs lg:text-sm lg:px-3'
        : variant === 'panel'
          ? 'h-10 px-3 text-sm'
          : 'h-[52px] px-3.5 text-[15px]';
    return (
      <a
        key={m.href}
        href={m.href}
        onClick={closeAll}
        className={`flex items-center gap-1.5 rounded-xl font-semibold no-underline transition-colors whitespace-nowrap shrink-0 ${shape} ${
          isActive ? 'bg-blue-50 text-blue-700' : 'text-ink-700 hover:bg-cream-50'
        }`}
      >
        <Icon name={m.icon} size={17} />
        {m.label}
      </a>
    );
  };

  return (
    <header className="relative border-b border-ink-200 bg-white">
      {/* 헤더만 본문(1000)보다 넓게 쓴다 — 로고·본문 시작선은 원래도 정확히 맞지 않았다.
          상한 이력: 1400 → 1560(2026-08-28, 메뉴 13개) → 1400(2026-09-04). 관리 드롭다운으로
          상시 메뉴가 8개로 줄어 1560 이 필요 없어졌다. 본문 `wide` 셸과 같은 값이라 넓은 화면에서
          시작선이 맞는다. */}
      <div className="mx-auto flex h-[60px] max-w-[1400px] items-center gap-2 px-3 sm:px-4">
        <a href="/" className="flex items-center gap-2 no-underline shrink-0 mr-1">
          <img src="/logo.png" alt="애니멀메이트" className="h-8 w-8 rounded-full" />
          <strong className="text-[17px] font-bold text-ink-900 hidden sm:inline">애니멀메이트</strong>
        </a>
        {/* 메뉴 줄은 **줄어들 수 있어야** 한다. `shrink-0` 이면 아무리 좁아도 제 너비를 고집해서
            헤더가 화면을 넘고, 그러면 오른쪽 끝의 `로그아웃` 이 잘린 채 페이지에 가로 스크롤이 생긴다
            (2026-07-31 QA: 회장단 계정 기준 1280px 에서 56px, 1366px 에서 13px 초과 — 노트북에서 흔한 폭이다).
            `overflow-x-auto` 는 원래 이걸 대비해 적혀 있었는데 `shrink-0` 이 함께 있어 한 번도 작동하지
            않았다 — 줄어들 수 있어야 안에서 스크롤된다. */}
        {menus.length > 0 ? (
          <nav className="hidden min-w-0 gap-0.5 overflow-x-auto md:flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {menus.map((m) => link(m))}
          </nav>
        ) : null}
        {/* 관리 드롭다운은 위 `nav` **밖**에 둔다. 안에 넣으면 `overflow-x-auto` 가 클리핑 상자를
            만들어 펼친 패널이 헤더 높이에서 잘린다(가로 스크롤 상자는 세로도 함께 자른다). */}
        {manage.length > 0 ? (
          <div ref={manageRef} className="relative hidden shrink-0 md:block">
            <button
              ref={manageBtnRef}
              onClick={() => setManageOpen((v) => !v)}
              aria-expanded={manageOpen}
              aria-controls="console-manage-menu"
              className={`flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 text-xs font-semibold transition-colors lg:px-3 lg:text-sm ${
                manageActive || manageOpen ? 'bg-blue-50 text-blue-700' : 'text-ink-700 hover:bg-cream-50'
              }`}
            >
              <Icon name="layers" size={17} />
              관리
              <Icon name="chevronDown" size={14} className={`transition-transform ${manageOpen ? 'rotate-180' : ''}`} />
            </button>
            {manageOpen ? (
              <div
                id="console-manage-menu"
                className="absolute left-0 top-full z-50 mt-1 flex w-[180px] flex-col gap-0.5 rounded-2xl border border-ink-200 bg-white p-1.5 shadow-raised"
              >
                {manage.map((m) => link(m, 'panel'))}
              </div>
            ) : null}
          </div>
        ) : null}
        <span className="flex-1 min-w-[8px]" />
        <div className="hidden sm:block shrink-0">
          <RoleBadge role={role} />
        </div>
        <a href="/profile" onClick={closeAll} className="hidden items-center gap-1 px-1.5 py-2 text-[13px] text-ink-500 no-underline hover:text-ink-700 md:flex whitespace-nowrap shrink-0">
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
          {menus.map((m) => link(m, 'drawer'))}
          {/* 서랍에서는 접지 않고 소제목만 붙여 펼쳐 둔다 — 세로로 길어질 뿐이라 접을 이유가 없고,
              서랍 안에 또 여는 단계를 두면 손가락 품만 는다. */}
          {manage.length > 0 ? (
            <>
              <p className="mt-1.5 border-t border-ink-100 px-3.5 pb-0.5 pt-2.5 text-[12px] font-bold text-ink-400">
                관리
              </p>
              {manage.map((m) => link(m, 'drawer'))}
            </>
          ) : null}
          <a
            href="/profile"
            onClick={closeAll}
            className="mt-1.5 flex h-[52px] items-center gap-2 border-t border-ink-100 px-3.5 pt-1 text-[15px] font-semibold text-ink-700 no-underline hover:bg-cream-50"
          >
            <Icon name="users" size={18} />
            내 정보
          </a>
          <button
            onClick={logout}
            className="flex h-[52px] items-center gap-2 px-3.5 text-[15px] font-semibold text-ink-500"
          >
            <Icon name="logout" size={18} />
            로그아웃
          </button>
        </div>
      ) : null}
    </header>
  );
}
