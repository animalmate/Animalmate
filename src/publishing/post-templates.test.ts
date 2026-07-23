import { describe, it, expect } from 'vitest';
import { renderTemplate } from './post-templates';

describe('renderTemplate — 플레이스홀더 치환', () => {
  it('제공된 값은 치환, 없는 키는 그대로 둔다', () => {
    const t = '{{날짜}} 봉사 / 집합 {{집합시간}} / 장소 {{장소}} / 정원 {{정원}}';
    expect(renderTemplate(t, { 날짜: '2026-03-01', 집합시간: '14:00' })).toBe(
      '2026-03-01 봉사 / 집합 14:00 / 장소 {{장소}} / 정원 {{정원}}'
    );
  });

  it('공백 허용', () => {
    expect(renderTemplate('{{ 날짜 }}', { 날짜: 'X' })).toBe('X');
  });

  it('플레이스홀더 없으면 원문 유지', () => {
    expect(renderTemplate('일반 공지 본문', {})).toBe('일반 공지 본문');
  });
});
