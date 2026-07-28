'use client';
// 팝업(모달) — 잠깐 확인하고 닫는 내용에 쓴다. 배경 클릭·Esc·닫기 버튼 셋 다로 닫힌다.
import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './icon';
import { SecondaryButton } from './ui';

// 팝업 안에서 Tab 으로 갈 수 있는 요소들. disabled 와 화면에서 빠진 것은 뺀다.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  title,
  onClose,
  children,
  // 도움말처럼 읽을거리가 들어가는 팝업은 넓어야 줄이 짧게 끊기지 않는다.
  // xl 은 표(면접 시간표)처럼 가로로 넓은 내용용.
  size = 'md',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 열기 직전에 어디 있었는지 기억해 두고, 닫을 때 그 자리로 초점을 돌려준다.
    // 이게 없으면 팝업을 닫은 뒤 초점이 <body> 로 떨어져, 키보드 사용자는 페이지 맨 위부터
    // 다시 Tab 을 눌러 내려와야 한다.
    const opener = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // 초점 가두기: aria-modal 은 보조기기에만 "뒤는 없는 셈 치라"고 알릴 뿐,
      // 실제 Tab 이동까지 막아 주지는 않는다. 그래서 팝업이 떠 있는데도 Tab 을 누르면
      // 뒤 화면의 버튼으로 초점이 새어 나가, 보이지도 않는 것을 조작하게 된다.
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      // 양 끝에서 넘어가려 하면 반대쪽 끝으로 돌린다(순환).
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    // 팝업 뒤 본문이 같이 스크롤되지 않게.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // 첫 초점은 팝업 안으로. 내용에 초점 받을 게 없으면 패널 자체가 받는다(tabIndex={-1}).
    const firstInside = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (firstInside ?? panelRef.current)?.focus();

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/45 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // 배경을 눌렀을 때만 닫는다.
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`flex max-h-[85vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-modal outline-none ${
          size === 'xl' ? 'max-w-5xl' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg'
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-5 py-3.5">
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-500 hover:bg-cream-100 hover:text-ink-700"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <div className="border-t border-ink-100 px-5 py-3">
          <SecondaryButton type="button" onClick={onClose} className="w-full">
            닫기
          </SecondaryButton>
        </div>
      </div>
    </div>
  );
}
