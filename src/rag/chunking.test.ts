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

  // 2026-08-28: 평가셋이 잡은 실제 결함이다. `33기 동아리 기본 정보` 가 `##` 를 제목 없는
  // 구분선으로만 써서 문서 전체가 한 섹션이 됐고, 길이로만 잘린 982자 잡탕 조각 안에 회비가
  // 묻혀 검색 12위까지 밀렸다("회비는 얼마예요?" 가 핸드오프됐다).
  it('제목 없는 `##` 구분선도 섹션을 나눈다 — 항목이 서로 다른 조각에 들어간다', () => {
    const md = `2010년에 결성된 동아리입니다.\n##\n활동 기간 :\n1년 (1년 이후 영구회원 전환 가능)\n##\n회비:\n5만원 (1년 기준)\n##\n활동 내용:\n보호소 봉사를 갑니다.`;
    const chunks = chunkDocument('동아리 기본 정보', md);
    expect(chunks.length).toBe(4);
    const 회비조각 = chunks.find((c) => c.content.includes('5만원'))!;
    expect(회비조각).toBeDefined();
    // 핵심은 개수가 아니라 **섞이지 않는 것**이다 — 회비 조각에 활동 내용이 딸려 오면
    // 그 조각은 다시 잡탕이 되고 "회비" 질문과의 유사도가 희석된다.
    expect(회비조각.content).not.toContain('보호소 봉사');
    expect(회비조각.content).not.toContain('2010년');
  });

  it('제목 없는 구분선은 헤딩 경로에 빈 칸을 만들지 않는다', () => {
    const md = `## 회계\n들어가는 말\n##\n회비는 5만원입니다.`;
    const chunks = chunkDocument('가이드', md);
    const 회비조각 = chunks.find((c) => c.content.includes('5만원'))!;
    expect(회비조각.content).toContain('[가이드 › 회계]');
    expect(회비조각.content).not.toMatch(/›\s*›/); // "가이드 › › 회계" 같은 빈 칸
  });

  it('`#hashtag` 처럼 글자가 붙은 줄은 구분선이 아니다', () => {
    const md = `본문 앞줄\n#해시태그\n본문 뒷줄`;
    const chunks = chunkDocument('문서', md);
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.content).toContain('#해시태그');
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
