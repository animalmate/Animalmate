import { describe, it, expect } from 'vitest';
import { isTermLapsed, kstToday } from './term-expiry';

describe('kstToday', () => {
  it('UTC 자정 직후에도 KST 기준으로는 이미 그날 오전이다', () => {
    // 2026-08-31 00:30 UTC = 2026-08-31 09:30 KST
    expect(kstToday(new Date('2026-08-31T00:30:00Z'))).toBe('2026-08-31');
  });

  it('UTC 로는 전날 저녁이어도 KST 로는 다음 날이다', () => {
    // 2026-08-30 15:30 UTC = 2026-08-31 00:30 KST
    // 크론이 UTC 15:00 이후에 돌 때 하루 밀리지 않는지 — 여기서 UTC 로 계산하면 8/30 이 된다.
    expect(kstToday(new Date('2026-08-30T15:30:00Z'))).toBe('2026-08-31');
  });

  it('연말 경계를 넘긴다', () => {
    expect(kstToday(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01');
  });
});

describe('isTermLapsed', () => {
  it('임기 마지막 날은 아직 유효하다', () => {
    // "2026-08-31 까지"라고 적었으면 그날 하루는 쓸 수 있어야 한다.
    expect(isTermLapsed('2026-08-31', '2026-08-31')).toBe(false);
  });

  it('하루 지나면 만료다', () => {
    expect(isTermLapsed('2026-08-31', '2026-09-01')).toBe(true);
  });

  it('임기가 한참 남았으면 만료가 아니다', () => {
    expect(isTermLapsed('2027-02-28', '2026-08-31')).toBe(false);
  });

  it('월·연 경계에서도 문자열 비교가 맞다', () => {
    expect(isTermLapsed('2026-12-31', '2027-01-01')).toBe(true);
    expect(isTermLapsed('2027-01-01', '2026-12-31')).toBe(false);
    // 자릿수가 고정(YYYY-MM-DD)이라 사전식 비교가 곧 날짜 비교다.
    expect(isTermLapsed('2026-09-09', '2026-09-10')).toBe(true);
    expect(isTermLapsed('2026-09-10', '2026-09-09')).toBe(false);
  });
});
