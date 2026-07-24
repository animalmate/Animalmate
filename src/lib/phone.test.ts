import { describe, it, expect } from 'vitest';
import { phoneDigits, isValidPhone, formatPhone } from './phone';

describe('isValidPhone', () => {
  it('0으로 시작하는 9~11자리 허용', () => {
    expect(isValidPhone('010-1234-5678')).toBe(true);
    expect(isValidPhone('01012345678')).toBe(true);
    expect(isValidPhone('02-123-4567')).toBe(true); // 유선 10자리
    expect(isValidPhone('031-123-456')).toBe(true); // 9자리
  });
  it('형식 아님 거부', () => {
    expect(isValidPhone('')).toBe(false);
    expect(isValidPhone(null)).toBe(false);
    expect(isValidPhone('1234')).toBe(false); // 너무 짧음
    expect(isValidPhone('123-4567-8901')).toBe(false); // 0으로 시작 안 함
    expect(isValidPhone('010-1234-56789')).toBe(false); // 12자리
  });
});

describe('formatPhone', () => {
  it('11자리 휴대폰 → 3-4-4', () => {
    expect(formatPhone('01012345678')).toBe('010-1234-5678');
  });
  it('10자리 02 → 2-4-4, 그 외 → 3-3-4', () => {
    expect(formatPhone('0212345678')).toBe('02-1234-5678');
    expect(formatPhone('0311234567')).toBe('031-123-4567');
  });
  it('형식 아니면 입력 그대로 trim', () => {
    expect(formatPhone('  abc ')).toBe('abc');
  });
});

describe('phoneDigits', () => {
  it('숫자만', () => {
    expect(phoneDigits('010-1234-5678')).toBe('01012345678');
  });
});
