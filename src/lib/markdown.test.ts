import { describe, it, expect } from 'vitest';
import { parseMarkdown, parseInline } from './markdown';

describe('parseInline', () => {
  it('굵게·기울임·인라인 코드', () => {
    expect(parseInline('**굵게**')).toEqual([{ t: 'bold', c: [{ t: 'text', v: '굵게' }] }]);
    expect(parseInline('_기울임_')).toEqual([{ t: 'italic', c: [{ t: 'text', v: '기울임' }] }]);
    expect(parseInline('`코드`')).toEqual([{ t: 'code', v: '코드' }]);
  });

  it('http/https 링크만 허용하고 위험 스킴은 평문으로 남긴다(XSS 방지)', () => {
    expect(parseInline('[네이버](https://naver.com)')).toEqual([
      { t: 'link', href: 'https://naver.com', c: [{ t: 'text', v: '네이버' }] },
    ]);
    // javascript: 스킴은 링크로 만들지 않는다 → 평문
    const danger = parseInline('[클릭](javascript:alert(1))');
    expect(danger.some((n) => n.t === 'link')).toBe(false);
  });

  it('평문과 서식이 섞여도 순서를 지킨다', () => {
    const r = parseInline('회비는 **2만원** 이에요');
    expect(r[0]).toEqual({ t: 'text', v: '회비는 ' });
    expect(r[1]).toEqual({ t: 'bold', c: [{ t: 'text', v: '2만원' }] });
  });
});

describe('parseMarkdown', () => {
  it('헤딩 레벨을 구분한다', () => {
    const b = parseMarkdown('# 제목\n## 소제목');
    expect(b[0]).toMatchObject({ t: 'h', level: 1 });
    expect(b[1]).toMatchObject({ t: 'h', level: 2 });
  });

  it('빈 줄로 문단을 나눈다', () => {
    const b = parseMarkdown('첫 문단.\n\n둘째 문단.');
    expect(b.filter((x) => x.t === 'p')).toHaveLength(2);
  });

  it('비순서·순서 목록을 인식한다', () => {
    const ul = parseMarkdown('- 하나\n- 둘');
    expect(ul[0]).toMatchObject({ t: 'ul' });
    expect((ul[0] as { items: unknown[] }).items).toHaveLength(2);
    const ol = parseMarkdown('1. 첫째\n2. 둘째');
    expect(ol[0]).toMatchObject({ t: 'ol' });
  });

  it('일반 텍스트에 원시 HTML 이 섞여도 태그로 해석하지 않는다(평문 취급)', () => {
    const b = parseMarkdown('<script>alert(1)</script> 안녕');
    // 파서는 인라인 텍스트로만 남긴다 — 렌더러가 React 텍스트로 그리므로 실행 불가.
    const text = JSON.stringify(b);
    expect(text).toContain('script'); // 문자로 보존
    expect(b[0]!.t).toBe('p');
  });
});
