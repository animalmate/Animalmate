'use client';
// 팝업(모달) — 잠깐 확인하고 닫는 내용에 쓴다. 배경 클릭·Esc·닫기 버튼 셋 다로 닫힌다.
import { useEffect, type ReactNode } from 'react';
import { Icon } from './icon';
import { SecondaryButton } from './ui';

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // 팝업 뒤 본문이 같이 스크롤되지 않게.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
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
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-modal">
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
