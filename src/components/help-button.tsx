'use client';
import { useState } from 'react';
import { Modal } from './modal';
import { Icon } from './icon';
import { Markdown } from './markdown';
import { SCREEN_HELP, type ScreenKey } from '@/guides/content';

/**
 * 화면별 도움말. 그 화면 제목 옆에 두고, 누르면 **그 화면 이야기만** 팝업으로 보여준다.
 * 통합 가이드 페이지를 두지 않는 이유는 읽는 사람이 지금 보고 있는 것만 필요하기 때문이다
 * (2026-07-28 사용자 지시. 시기별 이야기인 회장단 체크리스트만 `/guides` 로 따로 둔다).
 */
export function HelpButton({ screen }: { screen: ScreenKey }) {
  const [open, setOpen] = useState(false);
  const help = SCREEN_HELP[screen];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="이 화면 사용법"
        // 테두리 `ink-400` — 화면 제목 옆 페이지 배경에 맨몸으로 서는 버튼이라 툴바와 같은 기준을 쓴다
        // (ink-200 은 흰 바탕 대비 1.45:1 로 경계가 사라져 보였다. `ui.tsx` 의 ToolbarSelect 주석 참고).
        className="inline-flex h-control-sm min-h-tap shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-ink-400 bg-white px-3 text-[13px] font-semibold text-ink-500 transition-colors hover:border-blue-300 hover:text-blue-700"
      >
        <Icon name="info" size={15} />
        도움말
      </button>
      {open ? (
        <Modal title={help.title} onClose={() => setOpen(false)} size="lg">
          <Markdown variant="doc">{help.body}</Markdown>
        </Modal>
      ) : null}
    </>
  );
}
