import { describe, it, expect } from 'vitest';
import { timeOptions, timeLabel, isEarlyMorning } from './time-options';

describe('timeOptions — 10분 단위 고정', () => {
  const opts = timeOptions();

  it('00:00 부터 23:50 까지 10분 간격 144개', () => {
    expect(opts).toHaveLength(144);
    expect(opts[0]).toBe('00:00');
    expect(opts[1]).toBe('00:10');
    expect(opts.at(-1)).toBe('23:50');
  });

  it('분은 항상 10의 배수(1분 단위 값이 섞이지 않는다)', () => {
    expect(opts.every((t) => Number(t.split(':')[1]) % 10 === 0)).toBe(true);
  });

  it('예전에 저장된 어긋난 값은 그 건만 목록에 남긴다(값이 사라지지 않게)', () => {
    const withOdd = timeOptions('14:05');
    expect(withOdd).toContain('14:05');
    expect(withOdd).toHaveLength(145);
    expect(withOdd.indexOf('14:05')).toBe(withOdd.indexOf('14:00') + 1); // 정렬 유지
  });

  it('이미 10분 단위인 값은 중복으로 넣지 않는다', () => {
    expect(timeOptions('14:00')).toHaveLength(144);
  });
});

describe('timeLabel — 24시간을 앞에, 오전/오후는 괄호로', () => {
  it.each([
    ['00:00', '00:00 (오전 12:00)'],
    ['09:30', '09:30 (오전 9:30)'],
    ['12:00', '12:00 (오후 12:00)'],
    ['14:30', '14:30 (오후 2:30)'],
    ['23:50', '23:50 (오후 11:50)'],
  ])('%s → %s', (input, expected) => {
    expect(timeLabel(input)).toBe(expected);
  });

  // 실수의 정체는 "2:30 이 목록에 두 번 나온다"였다. 앞자리가 갈리는지 못박는다.
  it('오전 2시와 오후 2시는 앞자리부터 다르다', () => {
    expect(timeLabel('02:00').startsWith('02:00')).toBe(true);
    expect(timeLabel('14:00').startsWith('14:00')).toBe(true);
  });
});

describe('isEarlyMorning — 업로드 시각 실수 감지', () => {
  it.each(['00:00', '02:00', '05:50'])('%s 는 새벽', (t) => expect(isEarlyMorning(t)).toBe(true));
  it.each(['06:00', '09:00', '14:00', '20:00', '23:50'])('%s 는 새벽 아님', (t) =>
    expect(isEarlyMorning(t)).toBe(false)
  );
  it('빈 값·이상한 값에 반응하지 않는다', () => {
    expect(isEarlyMorning('')).toBe(false);
    expect(isEarlyMorning('아무거나')).toBe(false);
  });
});
