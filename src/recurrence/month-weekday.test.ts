import { describe, it, expect } from 'vitest';
import {
  nthWeekdayOfMonth,
  resolveRuleDate,
  monthWeekToNth,
  type Weekday,
} from './month-weekday';

const SUN: Weekday = 0;
const TUE: Weekday = 2;

// 검증 기준(실제 달력):
//  2026-02: 28일, 일요일 [1,8,15,22] (4번만)
//  2026-03: 일요일 [1,8,15,22,29] (5번), 화요일 [3,10,17,24,31]

describe('nthWeekdayOfMonth — 기본', () => {
  it('첫째 주: 달의 1일이 해당 요일이면 그 날(2026-02 첫째 일요일=1일)', () => {
    expect(nthWeekdayOfMonth(2026, 2, 1, SUN)).toEqual({ year: 2026, month: 2, day: 1 });
  });

  it('N번째 계산(2026-02 넷째 일요일=22일)', () => {
    expect(nthWeekdayOfMonth(2026, 2, 4, SUN)).toEqual({ year: 2026, month: 2, day: 22 });
  });

  it('2026-03 셋째 화요일=17일', () => {
    expect(nthWeekdayOfMonth(2026, 3, 3, TUE)).toEqual({ year: 2026, month: 3, day: 17 });
  });
});

describe('경계: 다섯째 주가 없는 달', () => {
  it('2026-02 다섯째 일요일 → null(존재하지 않음)', () => {
    expect(nthWeekdayOfMonth(2026, 2, 5, SUN)).toBeNull();
  });

  it('2026-03 다섯째 일요일 → 29일(존재함)', () => {
    expect(nthWeekdayOfMonth(2026, 3, 5, SUN)).toEqual({ year: 2026, month: 3, day: 29 });
  });
});

describe('경계: last 지정', () => {
  it('2026-02 마지막 일요일 = 22일(넷째와 동일 — 5번째 없음)', () => {
    expect(nthWeekdayOfMonth(2026, 2, 'last', SUN)).toEqual({ year: 2026, month: 2, day: 22 });
  });

  it('2026-03 마지막 일요일 = 29일(넷째=22 와 다름 — 5번째 존재)', () => {
    expect(nthWeekdayOfMonth(2026, 3, 'last', SUN)).toEqual({ year: 2026, month: 3, day: 29 });
    expect(nthWeekdayOfMonth(2026, 3, 4, SUN)).toEqual({ year: 2026, month: 3, day: 22 });
  });
});

describe('경계: 월말', () => {
  it('2026-03 마지막 화요일 = 31일(달의 마지막 날과 일치)', () => {
    expect(nthWeekdayOfMonth(2026, 3, 'last', TUE)).toEqual({ year: 2026, month: 3, day: 31 });
  });

  it('2026-03 다섯째 화요일 = 31일', () => {
    expect(nthWeekdayOfMonth(2026, 3, 5, TUE)).toEqual({ year: 2026, month: 3, day: 31 });
  });
});

describe('monthWeekToNth / resolveRuleDate (스키마 enum 연동)', () => {
  it('enum 매핑', () => {
    expect(monthWeekToNth('1')).toBe(1);
    expect(monthWeekToNth('4')).toBe(4);
    expect(monthWeekToNth('last')).toBe('last');
  });

  it("resolveRuleDate('last', 화) → 2026-03-31", () => {
    expect(resolveRuleDate(2026, 3, 'last', TUE)).toEqual({ year: 2026, month: 3, day: 31 });
  });

  it("resolveRuleDate('1', 일) → 2026-02-01", () => {
    expect(resolveRuleDate(2026, 2, '1', SUN)).toEqual({ year: 2026, month: 2, day: 1 });
  });
});
