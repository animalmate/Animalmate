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

/** '14:30' → '오후 2:30' */
export function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const hour = h ?? 0;
  const ampm = hour < 12 ? '오전' : '오후';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${ampm} ${h12}:${String(m ?? 0).padStart(2, '0')}`;
}
