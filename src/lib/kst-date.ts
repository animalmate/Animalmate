// KST 날짜 유틸 — 봉사 회차(rag/tools)와 동아리 일정(schedules)이 같은 구현을 쓴다.
//
// 왜 한 곳에 두나: 요일 계산은 이미 한 번 틀려서 사용자에게 나갔다(2026-07-31 — 2026-08-14(금)을
// '목'으로 답했다). 같은 함수를 두 번 쓰면 한쪽만 고쳐진다.

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 'YYYY-MM-DD' → 요일. **UTC 자정으로 읽는다.**
 *
 * `T00:00:00+09:00` 으로 파싱하고 `getUTCDay()` 를 읽으면 그 순간은 UTC 로 **전날 15시**라
 * 요일이 하루 밀린다. date 타입은 시각이 없으니 시간대를 끌어들일 이유가 없다.
 */
export function weekdayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? '' : (WEEKDAYS[d.getUTCDay()] ?? '');
}

/** KST 기준 오늘(YYYY-MM-DD). date 컬럼과 문자열로 비교하기 위한 값. */
export function kstToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
