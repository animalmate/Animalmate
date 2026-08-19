import { describe, it, expect } from 'vitest';
import { phoneDigits, isValidPhone, formatPhone, normalizeImportedPhone } from './phone';

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

describe('normalizeImportedPhone', () => {
  it('시트가 떼어먹은 앞 0 을 되살린다', () => {
    // 지원서는 "-" 없이 숫자만 받는데, 응답 스프레드시트를 거치면 수(number)로 해석돼 0 이 떨어진다.
    // 그대로 저장하면 지원자가 자기 번호로 결과를 조회하지 못한다(이름+전화 완전 일치).
    expect(normalizeImportedPhone('1012345678')).toBe('01012345678');
  });
  it('국가번호 표기를 0 으로 되돌린다', () => {
    expect(normalizeImportedPhone('+82 10-1234-5678')).toBe('01012345678');
    expect(normalizeImportedPhone('+82 010-1234-5678')).toBe('01012345678');
  });
  it('정상 번호는 숫자만 남기고 그대로 둔다', () => {
    expect(normalizeImportedPhone('01012345678')).toBe('01012345678');
    expect(normalizeImportedPhone('010-1234-5678')).toBe('01012345678');
    expect(normalizeImportedPhone('0212345678')).toBe('0212345678'); // 유선 10자리 — 손대지 않는다
  });
  it('해석이 안 되는 값은 지어내지 않는다', () => {
    expect(normalizeImportedPhone('')).toBe('');
    expect(normalizeImportedPhone('연락처 없음')).toBe('');
    expect(normalizeImportedPhone('123456')).toBe('123456');
  });
});
