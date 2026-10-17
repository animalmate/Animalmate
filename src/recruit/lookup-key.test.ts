import { describe, it, expect } from 'vitest';
import { lookupFailKey, lookupFailIpKey } from './lookup-key';

const SECRET = 'test-secret-for-lookup-key';

describe('lookupFailKey', () => {
  it('같은 이름은 항상 같은 키 — 반복 시도가 한 통에 모인다', () => {
    expect(lookupFailKey('홍길동', SECRET)).toBe(lookupFailKey('홍길동', SECRET));
  });

  it('다른 이름은 다른 키 — 같은 IP 뒤 다른 사람끼리 예산을 나눠 쓰지 않는다', () => {
    expect(lookupFailKey('홍길동', SECRET)).not.toBe(lookupFailKey('김철수', SECRET));
  });

  it('DB 매칭과 같은 정규화(trim) — 공백으로 카운터를 우회할 수 없다', () => {
    // 대조는 name.trim() 으로 하는데 카운터가 원문이면, 이름 뒤에 공백만 붙여도
    // 매번 새 통을 받아 무제한으로 시도할 수 있다.
    expect(lookupFailKey('  홍길동  ', SECRET)).toBe(lookupFailKey('홍길동', SECRET));
  });

  it('저장되는 값에 이름 원문이 남지 않는다(결정 25 — 시도 입력값 미저장)', () => {
    const key = lookupFailKey('홍길동', SECRET);
    expect(key).not.toContain('홍길동');
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/); // base64url — 원문 흔적 없음
  });

  it('비밀키가 다르면 키도 다르다 — 무염 해시가 아니다(사전 대입으로 못 되돌린다)', () => {
    expect(lookupFailKey('홍길동', SECRET)).not.toBe(lookupFailKey('홍길동', 'another-secret'));
  });

  it('비밀키가 없으면 조용히 넘어가지 않고 실패한다', () => {
    // 키 없이 해시하면 이름을 되돌릴 수 있는 값이 DB 에 쌓인다 — 그 상태로 도는 것이 더 나쁘다.
    expect(() => lookupFailKey('홍길동', '')).toThrow();
  });
});

describe('lookupFailIpKey — 조회하는 곳 + 대상', () => {
  it('같은 곳에서 같은 이름이면 같은 키, 곳이 다르면 다른 키 — 남의 시도가 내 통을 깎지 않는다', () => {
    expect(lookupFailIpKey('홍길동', '203.0.113.9', SECRET)).toBe(lookupFailIpKey('홍길동', '203.0.113.9', SECRET));
    expect(lookupFailIpKey('홍길동', '203.0.113.9', SECRET)).not.toBe(lookupFailIpKey('홍길동', '198.51.100.7', SECRET));
  });

  it('이름 통과 값이 겹치지 않는다(같은 비밀키를 쓰므로 도메인을 가른다)', () => {
    expect(lookupFailIpKey('홍길동', '', SECRET)).not.toBe(lookupFailKey('홍길동', SECRET));
  });

  it('IP 와 이름의 경계가 섞이지 않는다', () => {
    expect(lookupFailIpKey('5홍길동', '1.2.3.4', SECRET)).not.toBe(lookupFailIpKey('홍길동', '1.2.3.45', SECRET));
  });

  it('이름 정규화(trim)는 이름 통과 같다 — 공백으로 우회하지 못한다', () => {
    expect(lookupFailIpKey('  홍길동 ', '203.0.113.9', SECRET)).toBe(lookupFailIpKey('홍길동', '203.0.113.9', SECRET));
  });

  it('원문이 남지 않고, 비밀키가 없으면 실패한다', () => {
    expect(lookupFailIpKey('홍길동', '203.0.113.9', SECRET)).not.toContain('홍길동');
    expect(() => lookupFailIpKey('홍길동', '203.0.113.9', '')).toThrow();
  });
});
