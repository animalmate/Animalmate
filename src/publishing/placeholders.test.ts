import { describe, it, expect } from 'vitest';
import { dateVars, leadersBlock, kstDateStr } from './placeholders';

describe('dateVars', () => {
  it('간결_날짜=MM/DD, 전체_날짜=YYYY년 M월 D일 요일', () => {
    // 2026-07-23 은 목요일
    expect(dateVars('2026-07-23')).toEqual({ 간결_날짜: '07/23', 전체_날짜: '2026년 7월 23일 목요일' });
  });
  it('2026-03-01 은 일요일', () => {
    expect(dateVars('2026-03-01')).toEqual({ 간결_날짜: '03/01', 전체_날짜: '2026년 3월 1일 일요일' });
  });
  it('빈/잘못된 값 → 빈 객체', () => {
    expect(dateVars(null)).toEqual({});
    expect(dateVars('bad')).toEqual({});
  });
});

describe('leadersBlock', () => {
  it('직함 이름 전화 여러 줄', () => {
    expect(
      leadersBlock([
        { label: '팀장', name: '홍길동', phone: '010-0000-0000' },
        { label: '부팀장', name: '김철수', phone: '010-1111-1111' },
      ])
    ).toBe('팀장 홍길동 010-0000-0000\n부팀장 김철수 010-1111-1111');
  });
  it('빈 명단 → 빈 문자열', () => {
    expect(leadersBlock([])).toBe('');
    expect(leadersBlock(null)).toBe('');
  });
});

describe('kstDateStr', () => {
  it('UTC 15:00 → KST 다음날', () => {
    expect(kstDateStr(new Date('2026-07-22T15:00:00Z'))).toBe('2026-07-23');
  });
});
