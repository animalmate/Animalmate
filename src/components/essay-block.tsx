'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';

interface EssayBlockProps {
  label: string;
  text?: string | null;
  /** 면접 콘솔처럼 아래 입력칸이 밀리면 안 되는 화면에서 켠다. 길면 접고 '전체 보기'를 준다. */
  collapsible?: boolean;
  /** 접었을 때 보여줄 높이(px). */
  collapsedHeight?: number;
}

/**
 * 자기소개서 본문 표시. 서류 심사·면접 콘솔이 같은 컴포넌트를 쓴다.
 *
 * 긴 글을 전제로 한다(실제 지원서는 1000자를 넘기도 한다):
 * - break-words: 공백 없는 긴 URL 이 들어와도 가로로 삐져나가지 않게 한다.
 * - max-w: 한 줄이 70자를 넘으면 눈이 다음 줄을 놓친다. 카드가 넓어도 글줄은 제한한다.
 * - collapsible: 면접 콘솔에서 긴 자기소개서가 점수 입력칸을 화면 밖으로 밀어내지 않게 한다.
 */
export function EssayBlock({ label, text, collapsible = false, collapsedHeight = 200 }: EssayBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const content = text?.trim() || '';

  // 실제로 잘리는 글에만 '전체 보기'를 붙인다 — 짧은 글에 버튼이 붙으면 지저분하다.
  useLayoutEffect(() => {
    if (!collapsible) return;
    const el = bodyRef.current;
    if (!el) return;
    setOverflowing(el.scrollHeight > collapsedHeight + 8);
  }, [collapsible, collapsedHeight, content]);

  const clamped = collapsible && overflowing && !expanded;

  return (
    <div className="rounded-xl border border-cream-200 bg-cream-25 p-4 space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-blue-700">{label}</h3>
        {content.length > 0 && (
          <span className="shrink-0 text-[11px] font-medium text-ink-400">{content.length}자</span>
        )}
      </div>

      <div className="relative">
        <p
          ref={bodyRef}
          className="max-w-[68ch] overflow-hidden whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-900"
          style={clamped ? { maxHeight: collapsedHeight } : undefined}
        >
          {content || '내용 없음'}
        </p>
        {/* 잘렸다는 걸 알 수 있게 아래를 흐리게 덮는다. */}
        {clamped && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-cream-25 to-transparent" />
        )}
      </div>

      {collapsible && overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="min-h-tap text-xs font-semibold text-blue-700 underline-offset-2 hover:underline"
        >
          {expanded ? '접기' : '전체 보기'}
        </button>
      )}
    </div>
  );
}
