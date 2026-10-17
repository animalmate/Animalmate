// 안전한 마크다운 파서 — 순수 함수로 토큰 트리를 만든다(단위 테스트 대상).
// 렌더링(markdown.tsx)은 이 트리를 React 엘리먼트로 그린다 → 원시 HTML 을 절대 삽입하지 않는다
// (dangerouslySetInnerHTML 미사용). LLM 응답을 화면에 그리는 유일한 경로이므로 XSS 싱크가 없어야 한다.
//
// 지원: 문단, 헤딩(#~###), 순서/비순서 목록, 굵게(**), 기울임(*/_), 인라인 코드(`), 링크([]()).
// 링크는 http/https 와 사이트 안 경로만 허용(javascript: 등 위험 스킴 차단). 미지원 문법은 평문으로 남는다.

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

/**
 * 링크로 만들 수 있는 주소: http(s) 절대 주소, 또는 **우리 사이트 안의 경로**(`/guidebooks`).
 *
 * 사이트 안 경로를 받는 이유: 챗봇 시스템 프롬프트가 "`[2팀 가이드북](/guidebooks)` 로 안내하라"고
 * 시키는데 예전 규칙은 http(s) 만 받아서, 그 안내가 대괄호째 평문으로 찍혔다(2026-10-17 보안 감사가
 * 짚은 모순). `//evil.example` 과 `/\evil.example` 은 브라우저가 **다른 사이트 주소**로 읽으므로
 * 경로로 보지 않는다 — 슬래시 하나로 시작하고 바로 뒤가 슬래시·역슬래시가 아닐 때만 내부 경로다.
 */
const SAFE_HREF = /^(?:https?:\/\/|\/(?![/\\]))/i;

/** 우리 사이트 안의 경로인가(렌더러가 새 탭으로 열지 않는다). */
export function isInternalHref(href: string): boolean {
  return href.startsWith('/') && !/^\/[/\\]/.test(href);
}

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
