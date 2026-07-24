import { describe, it, expect } from 'vitest';
import { generateJoinCode, normalizeJoinCode, InvalidJoinCodeError, MIN_JOIN_CODE_LENGTH } from './join-codes';

describe('generateJoinCode', () => {
  it('기본 8자, 혼동되는 문자(0/O/1/I)를 쓰지 않는다', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateJoinCode();
      expect(code).toHaveLength(8);
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
    }
  });

  it('매번 다른 값(무작위)', () => {
    const seen = new Set(Array.from({ length: 100 }, () => generateJoinCode()));
    expect(seen.size).toBeGreaterThan(90);
  });
});

describe('normalizeJoinCode', () => {
  it('공백 제거 + 대문자로 정규화', () => {
    expect(normalizeJoinCode('  abc123  ')).toBe('ABC123');
  });

  it('너무 짧은 코드는 거부 — 가입은 이 코드 하나로만 막혀 있다', () => {
    expect(() => normalizeJoinCode('2026')).toThrow(InvalidJoinCodeError);
    expect(() => normalizeJoinCode('A')).toThrow(InvalidJoinCodeError);
    expect(() => normalizeJoinCode('A'.repeat(MIN_JOIN_CODE_LENGTH))).not.toThrow();
  });

  it('영문 대문자·숫자 외 문자는 거부(공백·기호·한글)', () => {
    expect(() => normalizeJoinCode('ANIMAL MATE')).toThrow(InvalidJoinCodeError);
    expect(() => normalizeJoinCode('animal-mate')).toThrow(InvalidJoinCodeError);
    expect(() => normalizeJoinCode('애니멀메이트')).toThrow(InvalidJoinCodeError);
  });

  it('지나치게 긴 코드도 거부', () => {
    expect(() => normalizeJoinCode('A'.repeat(33))).toThrow(InvalidJoinCodeError);
  });

  it('자동 생성 코드는 항상 형식 검사를 통과한다', () => {
    for (let i = 0; i < 50; i++) expect(() => normalizeJoinCode(generateJoinCode())).not.toThrow();
  });
});
