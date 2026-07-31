// 시각 선택 목록 — 10분 단위. 순수 함수라 단위 테스트로 간격을 고정한다.
// (input[type=time] 의 step 은 브라우저가 무시하는 경우가 있어 목록 방식으로 강제한다.)

export const TIME_STEP_MIN = 10;

/** '00:00' 부터 10분 간격. 예전에 저장된 값이 간격에 안 맞으면 그 값만 추가로 넣어 준다. */
export function timeOptions(current = '', stepMin = TIME_STEP_MIN): string[] {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += stepMin) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  if (current && !out.includes(current)) out.push(current);
  return out.sort();
}

/**
 * '14:30' → '14:30 (오후 2:30)'
 *
 * 24시간 값을 **앞에** 둔다. 오전/오후만 있으면 목록에 "2:30" 이 두 번 나오고, 스크롤하며
 * 숫자만 훑을 때 오전 2시와 오후 2시를 실제로 헷갈린다(2026-07-31 업로드 시각을 오전으로 잘못 지정).
 * 앞자리가 02 / 14 로 갈리면 고르는 순간에 바로 구분된다. 오전/오후는 익숙하니 괄호로 남긴다.
 * (색으로 구분하는 방법은 못 쓴다 — `<option>` 스타일은 브라우저마다 다르고, 아이폰은
 *  select 를 네이티브 휠 피커로 그려서 CSS 가 아예 적용되지 않는다.)
 */
export function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const hour = h ?? 0;
  const ampm = hour < 12 ? '오전' : '오후';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const mm = String(m ?? 0).padStart(2, '0');
  return `${String(hour).padStart(2, '0')}:${mm} (${ampm} ${h12}:${mm})`;
}

/** 새벽(00:00~05:59)인가. 업로드 시각이 여기면 오전/오후를 헷갈린 것일 가능성이 높다. */
export function isEarlyMorning(hhmm: string): boolean {
  // 빈 문자열을 먼저 걸러낸다 — Number('') 는 0 이라, 아직 아무것도 고르지 않은 칸에
  // "새벽입니다" 경고가 떠 버린다(테스트가 잡았다).
  const raw = hhmm.split(':')[0];
  if (!raw) return false;
  const hour = Number(raw);
  return Number.isInteger(hour) && hour >= 0 && hour < 6;
}
