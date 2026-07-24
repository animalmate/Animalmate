import { describe, it, expect } from 'vitest';
import { timeOptions, timeLabel } from './time-options';

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

describe('timeLabel — 오전/오후 표기', () => {
  it.each([
    ['00:00', '오전 12:00'],
    ['09:30', '오전 9:30'],
    ['12:00', '오후 12:00'],
    ['14:30', '오후 2:30'],
    ['23:50', '오후 11:50'],
  ])('%s → %s', (input, expected) => {
    expect(timeLabel(input)).toBe(expected);
  });
});
