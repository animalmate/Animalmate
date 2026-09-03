// KST 벽시계 ↔ 순간 변환. **9시간 어긋나는 사고**를 막는 것이 이 파일의 목적이다 —
// 번개 신청 시작 시각이 밀리면 오픈런이 통째로 거짓이 된다.
// (요일 계산 회귀는 이미 한 번 사용자에게 나갔다 — 2026-07-31.)

import { describe, it, expect } from 'vitest';
import { weekdayOf, kstToday, kstLocalToInstant, instantToKstLocal, kstDateTimeLabel } from './kst-date';

describe('weekdayOf', () => {
  it('날짜 문자열의 요일을 KST 기준으로 준다', () => {
    expect(weekdayOf('2026-08-14')).toBe('금'); // 예전에 '목' 으로 답했던 그 날짜
    expect(weekdayOf('2030-09-30')).toBe('월');
  });

  it('형식이 틀리면 빈 문자열', () => {
    expect(weekdayOf('9/30')).toBe('');
  });
});

describe('kstToday', () => {
  it('UTC 로는 전날이어도 KST 로는 오늘이다', () => {
    // UTC 2026-09-29 15:30 = KST 2026-09-30 00:30
    expect(kstToday(new Date('2026-09-29T15:30:00Z'))).toBe('2026-09-30');
  });
});

describe('kstLocalToInstant', () => {
  it('화면이 준 벽시계를 KST 로 못 박아 읽는다', () => {
    // 2026-09-30 15:00 KST = 06:00 UTC
    expect(kstLocalToInstant('2026-09-30T15:00')!.toISOString()).toBe('2026-09-30T06:00:00.000Z');
  });

  it('자정 언저리도 날짜가 밀리지 않는다', () => {
    expect(kstLocalToInstant('2026-09-30T00:30')!.toISOString()).toBe('2026-09-29T15:30:00.000Z');
  });

  it('형식이 아니면 null(잘못된 값이 DB 로 가지 않게)', () => {
    expect(kstLocalToInstant('2026-09-30 15:00')).toBeNull();
    expect(kstLocalToInstant('2026-09-30T25:00')).toBeNull();
    expect(kstLocalToInstant('')).toBeNull();
    expect(kstLocalToInstant(null)).toBeNull();
  });
});

describe('instantToKstLocal', () => {
  it('kstLocalToInstant 의 역이다(왕복해도 같은 값)', () => {
    for (const local of ['2026-09-30T15:00', '2026-01-01T00:00', '2026-12-31T23:59']) {
      expect(instantToKstLocal(kstLocalToInstant(local)!)).toBe(local);
    }
  });
});

describe('kstDateTimeLabel', () => {
  it('KST 오전·오후 표기로 읽어 준다', () => {
    expect(kstDateTimeLabel(new Date('2026-09-30T06:00:00Z'))).toBe('9월 30일(수) 오후 3:00');
    expect(kstDateTimeLabel(new Date('2026-09-29T23:05:00Z'))).toBe('9월 30일(수) 오전 8:05');
  });

  it('정오와 자정을 12 로 쓴다(0시·0분이 아니다)', () => {
    expect(kstDateTimeLabel(new Date('2026-09-30T03:00:00Z'))).toBe('9월 30일(수) 오후 12:00'); // KST 12:00
    expect(kstDateTimeLabel(new Date('2026-09-29T15:00:00Z'))).toBe('9월 30일(수) 오전 12:00'); // KST 00:00
  });
});
