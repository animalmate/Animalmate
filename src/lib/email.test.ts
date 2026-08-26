import { describe, it, expect } from 'vitest';
import { isValidEmail, normalizeEmail, sameEmail, MAX_EMAIL_LENGTH } from './email';

describe('isValidEmail', () => {
  it('평범한 주소는 통과한다', () => {
    for (const ok of [
      'hong@example.com',
      'a.b+tag@sub.example.co.kr',
      'HONG@EXAMPLE.COM',
      '  hong@example.com  ', // 앞뒤 공백은 다듬어 본다
    ]) {
      expect(isValidEmail(ok), `통과해야 하는 주소: ${ok}`).toBe(true);
    }
  });

  it('빈 값·모양이 아닌 값은 막는다', () => {
    for (const bad of ['', '   ', 'hong', 'hong@', '@example.com', 'hong@example', null, undefined, 42, {}]) {
      expect(isValidEmail(bad), `막아야 하는 값: ${String(bad)}`).toBe(false);
    }
  });

  // ── 여기부터가 이 모듈이 존재하는 이유다(파일 머리 주석) ──────────────────
  it('여러 주소를 한 문자열에 담는 형태를 막는다 — 공용 Gmail 을 릴레이로 쓰는 통로', () => {
    for (const bad of [
      'a@example.com,b@example.com',
      'a@example.com, b@example.com',
      'a@example.com;b@example.com',
      'Attacker <a@example.com>',
      '"a@example.com" <b@example.com>',
    ]) {
      expect(isValidEmail(bad), `막아야 하는 다중 수신자: ${bad}`).toBe(false);
    }
  });

  it('개행·제어문자를 막는다 — 메일 헤더 인젝션', () => {
    const NUL = String.fromCharCode(0);
    const DEL = String.fromCharCode(0x7f);
    for (const bad of [
      'a@example.com\nBcc: victim@example.com',
      'a@example.com\r\nBcc: victim@example.com',
      `a@example.com${NUL}`,
      `a@example.com${DEL}`,
    ]) {
      expect(isValidEmail(bad), `막아야 하는 제어문자: ${JSON.stringify(bad)}`).toBe(false);
    }
  });

  it('RFC 상한을 넘는 주소를 막는다', () => {
    const long = `${'a'.repeat(MAX_EMAIL_LENGTH)}@example.com`;
    expect(long.length).toBeGreaterThan(MAX_EMAIL_LENGTH);
    expect(isValidEmail(long)).toBe(false);
  });
});

describe('normalizeEmail / sameEmail', () => {
  it('대소문자·앞뒤 공백을 무시하고 비교한다', () => {
    expect(normalizeEmail('  Hong@Example.COM ')).toBe('hong@example.com');
    expect(sameEmail('Hong@Example.com', 'hong@example.com ')).toBe(true);
    expect(sameEmail('hong@example.com', 'park@example.com')).toBe(false);
  });

  it('빈 값끼리는 같은 것으로 본다(둘 다 "주소 없음")', () => {
    expect(sameEmail(null, undefined)).toBe(true);
    expect(sameEmail(null, 'hong@example.com')).toBe(false);
  });
});
