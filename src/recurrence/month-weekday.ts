// "매월 N번째 X요일" 날짜 계산 — 순수 로직(단위 테스트 필수: CLAUDE.md 코드 컨벤션).
// recurring_rules(month_week, weekday) → 특정 연·월의 실제 날짜.
//
// 타임존 주의: 날짜(연/월/일)만 계산한다. 시각(events.meet_time)·KST 결합은 호출부의 책임.
// 여기서는 UTC 기준 달력 산술만 사용해 타임존 오차를 배제한다.

/** 요일: 0=일 … 6=토 (JS Date.getUTCDay 와 동일, recurring_rules.weekday 와 일치). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** 몇 번째 주인가. 스키마 enum(1~4|last)보다 넓게 5 도 허용해 "다섯째 주 없음" 경계를 다룬다. */
export type NthWeek = 1 | 2 | 3 | 4 | 5 | 'last';

/** 타임존 없는 달력 날짜(month: 1~12). */
export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

/** recurring_rules.month_week('1'|'2'|'3'|'4'|'last') → NthWeek. */
export function monthWeekToNth(mw: '1' | '2' | '3' | '4' | 'last'): NthWeek {
  return mw === 'last' ? 'last' : (Number(mw) as 1 | 2 | 3 | 4);
}

function daysInMonth(year: number, month: number): number {
  // month 다음 달의 0일 = 이번 달 말일.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function weekdayOfFirst(year: number, month: number): Weekday {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay() as Weekday;
}

/**
 * 해당 연·월에서 nth 번째 weekday 의 날짜를 구한다.
 * 존재하지 않으면(예: 다섯째 주가 없는 달) null 을 반환한다.
 */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  nth: NthWeek,
  weekday: Weekday
): CalendarDate | null {
  const total = daysInMonth(year, month);
  const firstWd = weekdayOfFirst(year, month);
  // 이번 달 첫 번째 해당 요일의 '일'.
  const firstDay = 1 + ((weekday - firstWd + 7) % 7);

  if (nth === 'last') {
    // 첫 등장일에서 7일씩 더해 말일을 넘지 않는 마지막 값.
    let day = firstDay;
    while (day + 7 <= total) day += 7;
    return { year, month, day };
  }

  const day = firstDay + (nth - 1) * 7;
  if (day > total) return null; // 그 주차의 해당 요일이 이 달에 없음.
  return { year, month, day };
}

/**
 * recurring_rules 값으로 특정 연·월의 발행 날짜를 구한다(없으면 null).
 * @param monthWeek 스키마 enum 문자열
 */
export function resolveRuleDate(
  year: number,
  month: number,
  monthWeek: '1' | '2' | '3' | '4' | 'last',
  weekday: Weekday
): CalendarDate | null {
  return nthWeekdayOfMonth(year, month, monthWeekToNth(monthWeek), weekday);
}
