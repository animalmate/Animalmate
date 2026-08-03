// 일정 입력 검증 + 달력 격자 — 순수 로직만(DB 접근은 test/ 통합 테스트 몫).
// 권한(회장단만 수정)은 src/auth/permissions.test.ts 가 authorize 로 검증한다.

import { describe, it, expect } from 'vitest';
import { normalizeInput, ScheduleInputError, type ScheduleInput } from './schedules';
import { monthCells, monthRange, shiftMonth, occursOn, monthOf, daysInMonth, firstWeekday } from './calendar-grid';

const base: ScheduleInput = { title: '가을 정기총회', startDate: '2026-09-10', visibility: 'member' };

describe('normalizeInput', () => {
  it('공백을 정리하고 빈 값은 null 로 접는다', () => {
    const v = normalizeInput({ ...base, title: '  총회  ', place: '   ', details: '', startTime: '' });
    expect(v).toMatchObject({ title: '총회', place: null, details: null, startTime: null, endDate: null });
  });

  it('제목이 없으면 거절한다', () => {
    expect(() => normalizeInput({ ...base, title: '   ' })).toThrow(ScheduleInputError);
  });

  it('날짜 형식이 틀리면 거절한다', () => {
    expect(() => normalizeInput({ ...base, startDate: '2026/09/10' })).toThrow(ScheduleInputError);
    expect(() => normalizeInput({ ...base, startDate: '' })).toThrow(ScheduleInputError);
  });

  it('종료일이 시작일보다 앞서면 거절한다', () => {
    expect(() => normalizeInput({ ...base, endDate: '2026-09-09' })).toThrow(ScheduleInputError);
  });

  it('종료일이 시작일과 같으면 하루짜리(null)로 접는다', () => {
    expect(normalizeInput({ ...base, endDate: '2026-09-10' }).endDate).toBeNull();
    expect(normalizeInput({ ...base, endDate: '2026-09-11' }).endDate).toBe('2026-09-11');
  });

  it("시간은 'HH:MM' 으로 자르고, 형식이 틀리면 거절한다", () => {
    expect(normalizeInput({ ...base, startTime: '14:30:00' }).startTime).toBe('14:30');
    expect(normalizeInput({ ...base, startTime: '09:05' }).startTime).toBe('09:05');
    expect(() => normalizeInput({ ...base, startTime: '25:00' })).toThrow(ScheduleInputError);
    expect(() => normalizeInput({ ...base, startTime: '오후 2시' })).toThrow(ScheduleInputError);
  });

  it('공개 범위가 목록 밖이면 거절한다(등급을 지어내지 못하게)', () => {
    expect(() => normalizeInput({ ...base, visibility: 'everyone' as never })).toThrow(ScheduleInputError);
  });

  it('너무 긴 입력은 거절한다', () => {
    expect(() => normalizeInput({ ...base, title: 'ㄱ'.repeat(201) })).toThrow(ScheduleInputError);
    expect(() => normalizeInput({ ...base, details: 'ㄱ'.repeat(4001) })).toThrow(ScheduleInputError);
  });
});

describe('calendar-grid', () => {
  it('말일과 1일의 요일을 시간대와 무관하게 계산한다', () => {
    expect(daysInMonth({ year: 2026, month: 2 })).toBe(28);
    expect(daysInMonth({ year: 2028, month: 2 })).toBe(29); // 윤년
    expect(daysInMonth({ year: 2026, month: 8 })).toBe(31);
    expect(firstWeekday({ year: 2026, month: 8 })).toBe(6); // 2026-08-01 = 토
  });

  it('앞의 빈칸 수 = 1일의 요일, 칸 수 = 빈칸 + 일수', () => {
    const cells = monthCells({ year: 2026, month: 8 });
    expect(cells.slice(0, 6).every((c) => c === null)).toBe(true);
    expect(cells[6]).toBe('2026-08-01');
    expect(cells).toHaveLength(6 + 31);
    expect(cells.at(-1)).toBe('2026-08-31');
  });

  it('달 이동은 연도 경계를 넘는다', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 8 }, -8)).toEqual({ year: 2025, month: 12 });
  });

  it('조회 범위는 1일 ~ 말일', () => {
    expect(monthRange({ year: 2026, month: 2 })).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('여러 날 일정은 시작~종료 모든 날에 걸린다', () => {
    const mt = { startDate: '2026-09-11', endDate: '2026-09-13' };
    expect(occursOn(mt, '2026-09-10')).toBe(false);
    expect(occursOn(mt, '2026-09-11')).toBe(true);
    expect(occursOn(mt, '2026-09-12')).toBe(true);
    expect(occursOn(mt, '2026-09-13')).toBe(true);
    expect(occursOn(mt, '2026-09-14')).toBe(false);
  });

  it('하루짜리(endDate=null)는 그 날에만 걸린다', () => {
    const one = { startDate: '2026-09-10', endDate: null };
    expect(occursOn(one, '2026-09-10')).toBe(true);
    expect(occursOn(one, '2026-09-11')).toBe(false);
  });

  it('monthOf 는 날짜 문자열에서 연·월을 읽는다', () => {
    expect(monthOf('2026-08-03')).toEqual({ year: 2026, month: 8 });
  });
});
