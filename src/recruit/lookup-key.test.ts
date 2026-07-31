import { describe, it, expect } from 'vitest';
import { lookupFailKey } from './lookup-key';

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
