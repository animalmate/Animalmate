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

/**
 * 렌더 방식.
 *  - `chat`: 챗봇 답변(기본). 짧은 답이라 촘촘하게. **이 모양은 바꾸지 않는다.**
 *  - `doc`: 가이드처럼 긴 글. 제목 앞뒤 여백을 다르게 줘서 **어디서 이야기가 바뀌는지**가 보이게 한다.
 *    긴 글에서 모든 블록 간격이 같으면(space-y-2) 제목이 본문에 묻혀 훑어볼 수가 없다.
 */
type Variant = 'chat' | 'doc';

function renderBlock(b: Block, key: number, v: Variant, first: boolean): ReactNode {
  const doc = v === 'doc';
  switch (b.t) {
    case 'p':
      return (
        <p key={key} className={doc ? 'mt-3 leading-[1.75]' : 'leading-relaxed'}>
          {renderInline(b.c)}
        </p>
      );
    case 'h': {
      if (!doc) {
        const size = b.level === 1 ? 'text-lg font-bold' : b.level === 2 ? 'text-base font-bold' : 'text-[15px] font-semibold';
        return (
          <p key={key} className={`${size} text-ink-900`}>
            {renderInline(b.c)}
          </p>
        );
      }
      // 문서 모드: 단계(##)는 왼쪽 색 막대로 구분한다. 첫 블록은 위 여백을 주지 않는다.
      const top = first ? 'mt-0' : b.level <= 2 ? 'mt-8' : 'mt-6';
      if (b.level <= 2) {
        return (
          <h3 key={key} className={`${top} border-l-[3px] border-blue-400 pl-3 text-[17px] font-bold text-ink-900`}>
            {renderInline(b.c)}
          </h3>
        );
      }
      return (
        <h4 key={key} className={`${top} text-[15px] font-bold text-blue-700`}>
          {renderInline(b.c)}
        </h4>
      );
    }
    case 'ul':
      return (
        <ul key={key} className={doc ? 'mt-3 list-disc space-y-2 pl-5 marker:text-blue-400' : 'list-disc space-y-1 pl-5'}>
          {b.items.map((it, i) => (
            <li key={i} className={doc ? 'leading-[1.75] pl-1' : undefined}>
              {renderInline(it)}
            </li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol
          key={key}
          className={
            doc ? 'mt-3 list-decimal space-y-2 pl-5 marker:font-bold marker:text-blue-500' : 'list-decimal space-y-1 pl-5'
          }
        >
          {b.items.map((it, i) => (
            <li key={i} className={doc ? 'leading-[1.75] pl-1' : undefined}>
              {renderInline(it)}
            </li>
          ))}
        </ol>
      );
  }
}

/** 마크다운 문자열을 안전하게 렌더한다(원시 HTML 미사용 — 파일 상단 주석 참고). */
export function Markdown({ children, variant = 'chat' }: { children: string; variant?: Variant }) {
  const blocks = parseMarkdown(children);
  // 굵은 글씨는 본문보다 진하게 — 문서 모드에서 강조가 눈에 띄어야 훑어볼 수 있다.
  const wrap =
    variant === 'doc'
      ? 'text-[15px] text-ink-600 [&_strong]:font-semibold [&_strong]:text-ink-900'
      : 'space-y-2 text-[15px] text-ink-700';
  return <div className={wrap}>{blocks.map((b, i) => renderBlock(b, i, variant, i === 0))}</div>;
}
