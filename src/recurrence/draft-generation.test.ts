import { describe, it, expect } from 'vitest';
import { draftDueOccurrence, formatDate } from './draft-generation';

// UTC 기준 날짜(테스트 안정성). 검증 기준:
//  2026-01: 첫째 일요일 = 1/4 (1/1=목)
//  2026-02: 첫째 일요일 = 2/1 (2/1=일)
//  2026-03: 마지막 화요일 = 3/31
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe('draftDueOccurrence — D-lead 판정', () => {
  const firstSunday = { monthWeek: '1' as const, weekday: 0, draftLeadDays: 3 };

  it('다음 달 첫째 일요일(2/1)의 D-3 = 1/29 → 2/1 회차 반환', () => {
    expect(draftDueOccurrence(firstSunday, utc(2026, 1, 29))).toEqual({ year: 2026, month: 2, day: 1 });
  });

  it('이번 달 첫째 일요일(1/4)의 D-3 = 1/1 → 1/4 회차 반환', () => {
    expect(draftDueOccurrence(firstSunday, utc(2026, 1, 1))).toEqual({ year: 2026, month: 1, day: 4 });
  });

  it('회차 당일(2/1)은 초안 생성일 아님 → null', () => {
    expect(draftDueOccurrence(firstSunday, utc(2026, 2, 1))).toBeNull();
  });

  it('lead=0 이면 회차 당일이 생성일', () => {
    expect(draftDueOccurrence({ monthWeek: '1', weekday: 0, draftLeadDays: 0 }, utc(2026, 2, 1))).toEqual({
      year: 2026,
      month: 2,
      day: 1,
    });
  });

  it('월말 회차(마지막 화요일 3/31) D-3 = 3/28 → 3/31 반환', () => {
    const lastTue = { monthWeek: 'last' as const, weekday: 2, draftLeadDays: 3 };
    expect(draftDueOccurrence(lastTue, utc(2026, 3, 28))).toEqual({ year: 2026, month: 3, day: 31 });
  });

  it('해당일 아니면 null', () => {
    expect(draftDueOccurrence(firstSunday, utc(2026, 1, 15))).toBeNull();
  });
});

describe('formatDate', () => {
  it('YYYY-MM-DD 제로패딩', () => {
    expect(formatDate({ year: 2026, month: 3, day: 5 })).toBe('2026-03-05');
  });
});
