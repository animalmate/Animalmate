import { describe, it, expect } from 'vitest';
import { waitMessage, errorMessage } from './api';

describe('waitMessage', () => {
  // 429 를 "잠시 후 다시"로만 안내하면 1시간짜리 차단을 몇 초로 오해해 계속 눌러 보게 된다.
  // 실제로 얼마나 기다려야 하는지가 문구에 들어가야 한다.
  it('1분 미만은 초로 말한다', () => {
    expect(waitMessage(45)).toContain('45초');
  });

  it('1분 이상은 분으로 올려 말한다', () => {
    expect(waitMessage(60)).toContain('1분');
    expect(waitMessage(3600)).toContain('60분');
    expect(waitMessage(90)).toContain('2분'); // 올림 — 덜 기다리게 안내하면 또 막힌다
  });

  it('서버가 retryAfter 를 안 주면 60초로 본다', () => {
    expect(waitMessage(undefined)).toContain('1분');
  });

  it('0·음수여도 "0초 후"처럼 말하지 않는다', () => {
    expect(waitMessage(0)).toContain('1초');
    expect(waitMessage(-5)).toContain('1초');
  });
});

describe('errorMessage', () => {
  it('모르는 코드는 기본 문구로 떨어진다(빈 화면 대신)', () => {
    expect(errorMessage('처음보는코드')).toBe('오류가 발생했습니다.');
    expect(errorMessage(undefined)).toBe('오류가 발생했습니다.');
  });

  it('가입 화면이 실제로 마주치는 코드에 사람 말 문구가 있다', () => {
    for (const code of ['invalid_join_code', 'bad_phone', 'consent_required', 'rate_limited', 'otp_invalid']) {
      expect(errorMessage(code)).not.toBe('오류가 발생했습니다.');
    }
  });
});
