// 챗봇 봉사 tool 의 순수 변환 — 요일 계산과 업로드 시각(KST) 환산.
// DB 는 붙지 않는다(통합은 test/chatbot-tools.security.test.ts).

import { describe, it, expect } from 'vitest';
import { weekdayOf, toUploadView } from './tools';

describe('weekdayOf — 요일이 하루 밀리지 않는다', () => {
  // 2026-07-31 발견: `T00:00:00+09:00` 으로 파싱하고 getUTCDay() 를 읽어 UTC 로 전날 15시가 되는 바람에
  // 요일이 하루씩 밀렸다. 실제 답변에 "8월 14일 목요일"(맞는 답은 금요일)로 나갔다.
  it.each([
    ['2026-08-14', '금'],
    ['2026-08-29', '토'],
    ['2026-08-25', '화'],
    ['2026-07-31', '금'],
  ])('%s → %s요일', (date, expected) => {
    expect(weekdayOf(date)).toBe(expected);
  });

  it('이상한 값에는 빈 문자열', () => {
    expect(weekdayOf('아무거나')).toBe('');
    expect(weekdayOf('')).toBe('');
  });
});

describe('toUploadView — 업로드 시각을 KST 로 환산한다', () => {
  // publish_at 은 timestamptz(UTC 저장)다. 그대로 읽어 주면 9시간 어긋난 시각을 안내한다.
  it('UTC 06:00 → KST 15:00, 날짜·요일도 KST 기준', () => {
    const v = toUploadView(new Date('2026-08-25T06:00:00Z'), false);
    expect(v).toEqual({ date: '2026-08-25', weekday: '화', time: '15:00', done: false });
  });

  it('자정을 넘기면 날짜와 요일이 함께 넘어간다', () => {
    // UTC 2026-08-25 20:00 = KST 2026-08-26 05:00(수)
    const v = toUploadView(new Date('2026-08-25T20:00:00Z'), false);
    expect(v.date).toBe('2026-08-26');
    expect(v.weekday).toBe('수');
    expect(v.time).toBe('05:00');
  });

  it('이미 올라간 건 done=true', () => {
    expect(toUploadView(new Date('2026-07-26T05:30:00Z'), true).done).toBe(true);
  });
});
