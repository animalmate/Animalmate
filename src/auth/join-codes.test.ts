import { describe, it, expect } from 'vitest';
import {
  generateJoinCode,
  normalizeJoinCode,
  isDuplicateCodeError,
  InvalidJoinCodeError,
  MIN_JOIN_CODE_LENGTH,
} from './join-codes';

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

describe('isDuplicateCodeError', () => {
  // 제약 이름을 바꾸면 이 테스트가 깨진다 — 그래야 한다. 이름이 어긋나면 중복 발급이 다시
  // 정체불명의 500 으로 나가는데, 그건 조용해서 아무도 눈치채지 못한다.
  it('code 컬럼 unique 위반(23505)만 참', () => {
    expect(isDuplicateCodeError({ code: '23505', constraint_name: 'join_codes_code_unique' })).toBe(true);
  });

  it('같은 23505 라도 활성 코드 1개 제약이면 거짓(원인이 다르다)', () => {
    expect(isDuplicateCodeError({ code: '23505', constraint_name: 'join_codes_single_active' })).toBe(false);
  });

  it('다른 오류·빈 값에는 반응하지 않는다', () => {
    expect(isDuplicateCodeError({ code: '23502', constraint_name: 'join_codes_code_unique' })).toBe(false);
    expect(isDuplicateCodeError(new Error('boom'))).toBe(false);
    expect(isDuplicateCodeError(null)).toBe(false);
    expect(isDuplicateCodeError(undefined)).toBe(false);
  });
});
