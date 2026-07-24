import { describe, it, expect } from 'vitest';
import { chunkDocument, estimateTokens, TARGET_MAX_TOKENS } from './chunking';

describe('chunkDocument', () => {
  it('헤딩마다 조각이 나뉘고 각 조각에 제목·헤딩 경로가 문맥으로 붙는다', () => {
    const md = `## 회비 안내\n한 학기 2만원입니다.\n\n## 봉사 신청\n카페 댓글로 신청해요.`;
    const chunks = chunkDocument('운영 안내', md);
    expect(chunks.length).toBe(2);
    expect(chunks[0]!.content).toContain('[운영 안내 › 회비 안내]');
    expect(chunks[0]!.content).toContain('2만원');
    expect(chunks[1]!.content).toContain('[운영 안내 › 봉사 신청]');
    expect(chunks[0]!.index).toBe(0);
    expect(chunks[1]!.index).toBe(1);
  });

  it('중첩 헤딩은 경로로 이어진다(상위 › 하위)', () => {
    const md = `# 운영\n## 회계\n### 회비\n학기당 2만원.`;
    const [c] = chunkDocument('가이드', md);
    expect(c!.content).toContain('가이드 › 운영 › 회계 › 회비');
  });

  it('아주 긴 섹션은 여러 조각으로 쪼개지고 각 조각이 상한 안에 든다', () => {
    const long = Array.from({ length: 40 }, (_, i) => `이것은 ${i}번째 문단입니다. 봉사 활동에 대한 설명이 이어집니다.`).join('\n\n');
    const chunks = chunkDocument('긴 문서', `## 긴 섹션\n${long}`);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(estimateTokens(c.content)).toBeLessThanOrEqual(TARGET_MAX_TOKENS + 60);
  });

  it('헤딩이 없는 문서도 하나 이상의 조각을 만든다', () => {
    const chunks = chunkDocument('무제', '헤딩 없이 그냥 본문만 있는 짧은 글입니다.');
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.content).toContain('무제');
  });

  it('빈 본문은 조각을 만들지 않는다', () => {
    expect(chunkDocument('제목', '   \n\n  ')).toHaveLength(0);
  });

  it('작은 인접 문단은 하나로 병합되어 너무 잘게 쪼개지지 않는다', () => {
    const md = `## 짧은 것들\n가.\n\n나.\n\n다.\n\n라.`;
    const chunks = chunkDocument('문서', md);
    expect(chunks.length).toBe(1); // 다 합쳐도 상한 이내
  });
});
