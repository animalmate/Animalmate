// 안전한 마크다운 파서 — 순수 함수로 토큰 트리를 만든다(단위 테스트 대상).
// 렌더링(markdown.tsx)은 이 트리를 React 엘리먼트로 그린다 → 원시 HTML 을 절대 삽입하지 않는다
// (dangerouslySetInnerHTML 미사용). LLM 응답을 화면에 그리는 유일한 경로이므로 XSS 싱크가 없어야 한다.
//
// 지원: 문단, 헤딩(#~###), 순서/비순서 목록, 굵게(**), 기울임(*/_), 인라인 코드(`), 링크([]()).
// 링크는 http/https 만 허용(javascript: 등 위험 스킴 차단). 미지원 문법은 평문으로 남는다.

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'bold'; c: Inline[] }
  | { t: 'italic'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[] };

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'h'; level: 1 | 2 | 3; c: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; items: Inline[][] };

const SAFE_HREF = /^https?:\/\//i;

/** 인라인 파싱 — 굵게/기울임/코드/링크. 재귀로 중첩(굵게 안의 링크 등)을 처리한다. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  let plain = '';
  const flush = () => {
    if (plain) out.push({ t: 'text', v: plain });
    plain = '';
  };
  while (i < text.length) {
    const rest = text.slice(i);
    // 인라인 코드(가장 먼저 — 안쪽은 다른 문법을 적용하지 않는다)
    const code = /^`([^`]+)`/.exec(rest);
    if (code) {
      flush();
      out.push({ t: 'code', v: code[1]! });
      i += code[0].length;
      continue;
    }
    // 굵게 **...**
    const bold = /^\*\*([^]+?)\*\*/.exec(rest);
    if (bold) {
      flush();
      out.push({ t: 'bold', c: parseInline(bold[1]!) });
      i += bold[0].length;
      continue;
    }
    // 링크 [text](href)
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
    if (link && SAFE_HREF.test(link[2]!)) {
      flush();
      out.push({ t: 'link', href: link[2]!, c: parseInline(link[1]!) });
      i += link[0].length;
      continue;
    }
    // 기울임 *...* 또는 _..._ (굵게와 겹치지 않게 ** 는 위에서 이미 처리)
    const ital = /^(?:\*([^*\n]+?)\*|_([^_\n]+?)_)/.exec(rest);
    if (ital) {
      flush();
      out.push({ t: 'italic', c: parseInline((ital[1] ?? ital[2])!) });
      i += ital[0].length;
      continue;
    }
    plain += text[i];
    i += 1;
  }
  flush();
  return out;
}

/** 블록 파싱 — 헤딩/목록/문단. 빈 줄로 문단을 나눈다. */
export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  let para: string[] = [];
  const flushPara = () => {
    const text = para.join(' ').trim();
    if (text) blocks.push({ t: 'p', c: parseInline(text) });
    para = [];
  };

  while (i < lines.length) {
    const line = lines[i]!;
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const ulItem = /^\s*[-*]\s+(.*)$/.exec(line);
    const olItem = /^\s*\d+\.\s+(.*)$/.exec(line);

    if (!line.trim()) {
      flushPara();
      i += 1;
    } else if (heading) {
      flushPara();
      blocks.push({ t: 'h', level: heading[1]!.length as 1 | 2 | 3, c: parseInline(heading[2]!) });
      i += 1;
    } else if (ulItem || olItem) {
      flushPara();
      const ordered = !!olItem;
      const items: Inline[][] = [];
      while (i < lines.length) {
        const m = ordered ? /^\s*\d+\.\s+(.*)$/.exec(lines[i]!) : /^\s*[-*]\s+(.*)$/.exec(lines[i]!);
        if (!m) break;
        items.push(parseInline(m[1]!));
        i += 1;
      }
      blocks.push(ordered ? { t: 'ol', items } : { t: 'ul', items });
    } else {
      para.push(line);
      i += 1;
    }
  }
  flushPara();
  return blocks;
}
