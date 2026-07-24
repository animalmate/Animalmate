import { describe, it, expect } from 'vitest';
import { checkLength, parseDate, InputTooLongError, LIMITS } from './input';

describe('checkLength', () => {
  it('한도 이내면 통과', () => {
    expect(() => checkLength('제목', 'a'.repeat(LIMITS.title), LIMITS.title)).not.toThrow();
  });

  it('한도를 1자라도 넘으면 거부(자르지 않는다 — 잘린 채 공지가 나가면 안 되므로)', () => {
    expect(() => checkLength('제목', 'a'.repeat(LIMITS.title + 1), LIMITS.title)).toThrow(InputTooLongError);
  });

  it('null/undefined 는 "이번 요청에서 다루지 않음" 으로 보고 통과', () => {
    expect(() => checkLength('본문', null, 10)).not.toThrow();
    expect(() => checkLength('본문', undefined, 10)).not.toThrow();
  });

  it('거부 시 필드명과 한도를 알려준다(화면이 안내 문구를 만들 수 있게)', () => {
    try {
      checkLength('본문', 'x'.repeat(11), 10);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(InputTooLongError);
      expect((e as InputTooLongError).field).toBe('본문');
      expect((e as InputTooLongError).max).toBe(10);
      expect((e as InputTooLongError).status).toBe(400);
    }
  });
});

describe('parseDate', () => {
  it('정상 날짜 문자열 → Date', () => {
    expect(parseDate('2026-08-01T10:00:00Z')?.toISOString()).toBe('2026-08-01T10:00:00.000Z');
  });

  it('빈 값 → null', () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate('')).toBeNull();
  });

  it('파싱 불가 문자열 → null (Invalid Date 가 DB 로 내려가지 않게)', () => {
    expect(parseDate('내일쯤')).toBeNull();
    expect(parseDate('2026-13-45')).toBeNull();
    expect(parseDate({})).toBeNull();
  });
});
