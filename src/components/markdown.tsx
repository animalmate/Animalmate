// 마크다운 → React 엘리먼트 렌더러. parseMarkdown 이 만든 트리를 그린다.
// 원시 HTML 을 절대 삽입하지 않는다(dangerouslySetInnerHTML 미사용) — 모든 텍스트는 React 가
// 이스케이프한다. LLM 응답을 화면에 그리는 경로라 XSS 싱크가 없어야 한다(07-DECISIONS 10 DoD).

import { Fragment, type ReactNode } from 'react';
import { parseMarkdown, type Block, type Inline } from '@/lib/markdown';

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'text':
        return <Fragment key={i}>{n.v}</Fragment>;
      case 'bold':
        return <strong key={i}>{renderInline(n.c)}</strong>;
      case 'italic':
        return <em key={i}>{renderInline(n.c)}</em>;
      case 'code':
        return (
          <code key={i} className="rounded bg-ink-100 px-1 py-0.5 text-[0.9em] text-ink-900">
            {n.v}
          </code>
        );
      case 'link':
        return (
          // href 는 파서에서 http/https 만 통과. 새 탭 + noopener.
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
            {renderInline(n.c)}
          </a>
        );
    }
  });
}

function renderBlock(b: Block, key: number): ReactNode {
  switch (b.t) {
    case 'p':
      return (
        <p key={key} className="leading-relaxed">
          {renderInline(b.c)}
        </p>
      );
    case 'h': {
      const size = b.level === 1 ? 'text-lg font-bold' : b.level === 2 ? 'text-base font-bold' : 'text-[15px] font-semibold';
      return (
        <p key={key} className={`${size} text-ink-900`}>
          {renderInline(b.c)}
        </p>
      );
    }
    case 'ul':
      return (
        <ul key={key} className="list-disc space-y-1 pl-5">
          {b.items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol key={key} className="list-decimal space-y-1 pl-5">
          {b.items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ol>
      );
  }
}

/** 마크다운 문자열을 안전하게 렌더한다. */
export function Markdown({ children }: { children: string }) {
  const blocks = parseMarkdown(children);
  return <div className="space-y-2 text-[15px] text-ink-700">{blocks.map((b, i) => renderBlock(b, i))}</div>;
}
