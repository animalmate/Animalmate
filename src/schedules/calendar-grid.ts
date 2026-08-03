// 달력 격자 계산 — 순수 함수만. 화면(panel.tsx)이 쓰고 단위 테스트가 검증한다.
//
// 날짜는 전부 'YYYY-MM-DD' 문자열로 다루고 계산은 UTC 로만 한다. 로컬 시간대를 섞으면
// 브라우저 시간대에 따라 격자가 하루 밀린다(요일이 밀리는 사고와 같은 뿌리).

export interface MonthRef {
  year: number;
  month: number; // 1~12
}

const pad = (n: number) => String(n).padStart(2, '0');

/** {year, month, day} → 'YYYY-MM-DD'. */
export function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** 그 달의 일수. */
export function daysInMonth({ year, month }: MonthRef): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate(); // month 는 1-base → 다음 달 0일 = 이 달 말일
}

/** 그 달 1일의 요일(0=일). */
export function firstWeekday({ year, month }: MonthRef): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

/**
 * 달력 격자에 넣을 칸 목록. 앞의 빈칸은 null, 나머지는 날짜 문자열.
 * 뒤는 채우지 않는다 — 마지막 줄이 짧게 끝나도 격자가 깨지지 않는다(grid 가 알아서 왼쪽부터 채운다).
 */
export function monthCells(ref: MonthRef): (string | null)[] {
  const lead = Array.from({ length: firstWeekday(ref) }, () => null);
  const days = Array.from({ length: daysInMonth(ref) }, (_, i) => ymd(ref.year, ref.month, i + 1));
  return [...lead, ...days];
}

/** 그 달의 조회 범위(1일 ~ 말일). 여러 날 일정은 서버의 겹침 조건이 걸러 준다. */
export function monthRange(ref: MonthRef): { from: string; to: string } {
  return { from: ymd(ref.year, ref.month, 1), to: ymd(ref.year, ref.month, daysInMonth(ref)) };
}

/** 달 이동(±n). 연도 경계를 넘어간다. */
export function shiftMonth(ref: MonthRef, delta: number): MonthRef {
  const zero = ref.year * 12 + (ref.month - 1) + delta;
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1 };
}

/** 이 일정이 그 날짜에 걸치는가(여러 날 일정은 시작~종료 모든 날에 걸린다). */
export function occursOn(s: { startDate: string; endDate: string | null }, day: string): boolean {
  return s.startDate <= day && day <= (s.endDate ?? s.startDate);
}

/** 'YYYY-MM-DD' → MonthRef. */
export function monthOf(day: string): MonthRef {
  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) };
}
