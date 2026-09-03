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

// ── KST 벽시계 ↔ 순간(Date) ────────────────────────────────────────────
//
// 왜 필요한가: 화면의 `datetime-local` 은 **브라우저 시간대**의 벽시계 문자열을 준다.
// 그대로 `new Date(local)` 하면 그 브라우저가 어느 시간대인지에 따라 다른 순간이 된다 —
// 이 동아리는 전원 KST 라 대개 맞지만, 여행 중이거나 시간대가 틀어진 기기 하나면 **9시간**
// 어긋난다. 번개 신청 시작 시각은 그 순간이 곧 오픈런이라, 9시간 밀리면 기능이 통째로 거짓이 된다.
//
// 그래서 화면이 준 값을 **언제나 KST 벽시계로 못 박아** 해석한다(`+09:00` 을 붙인다).
// 반대 방향(표시)도 같은 규칙으로 되돌린다. 한국 표준시는 서머타임이 없어 고정 +9 로 충분하다.

const KST_OFFSET_MS = 9 * 3600 * 1000;
const LOCAL_RE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

/**
 * 'YYYY-MM-DDTHH:MM'(KST 벽시계) → 그 순간. 형식이 틀리면 null.
 * 브라우저 시간대와 무관하다 — 문자열을 KST 로 읽는 것이 정의다.
 */
export function kstLocalToInstant(local: string | null | undefined): Date | null {
  const s = (local ?? '').trim();
  if (!LOCAL_RE.test(s)) return null;
  const d = new Date(`${s}:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 순간 → 'YYYY-MM-DDTHH:MM'(KST 벽시계). `datetime-local` 에 되돌려 넣는 값. */
export function instantToKstLocal(d: Date): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 16);
}

/**
 * 순간 → 사람이 읽는 KST 표기. `9월 30일(월) 오후 3:00`.
 *
 * `toLocaleString('ko-KR')` 을 쓰지 않는 이유: 서버(Vercel, UTC)와 브라우저가 서로 다른
 * 시간대·로케일 데이터를 갖고 있어 같은 값이 화면마다 다르게 찍힌다. 규칙을 코드에 둔다.
 */
export function kstDateTimeLabel(d: Date): string {
  const k = new Date(d.getTime() + KST_OFFSET_MS);
  const iso = k.toISOString();
  const day = weekdayOf(iso.slice(0, 10));
  const h24 = k.getUTCHours();
  const min = k.getUTCMinutes();
  const ampm = h24 < 12 ? '오전' : '오후';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일(${day}) ${ampm} ${h12}:${String(min).padStart(2, '0')}`;
}
