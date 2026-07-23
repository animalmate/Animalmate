import { describe, it, expect } from 'vitest';
import {
  encryptToken,
  decryptToken,
  decodeKey,
  generateKeyBase64,
} from './token-cipher';
import { randomBytes } from 'node:crypto';

const key = randomBytes(32);

describe('token-cipher — AES-256-GCM 왕복', () => {
  it('암호화 → 복호화 = 원문', () => {
    const plain = 'naver-refresh-token-예시-🐾';
    const enc = encryptToken(plain, key);
    expect(enc).not.toContain(plain); // 평문이 그대로 노출되지 않음
    expect(decryptToken(enc, key)).toBe(plain);
  });

  it('매 암호화마다 IV 가 달라 암호문이 달라짐(동일 평문)', () => {
    const a = encryptToken('same', key);
    const b = encryptToken('same', key);
    expect(a).not.toBe(b);
    expect(decryptToken(a, key)).toBe('same');
    expect(decryptToken(b, key)).toBe('same');
  });

  it('다른 키로 복호화하면 실패(GCM 인증)', () => {
    const enc = encryptToken('secret', key);
    expect(() => decryptToken(enc, randomBytes(32))).toThrow();
  });

  it('변조된 암호문은 복호화 실패(무결성 탐지)', () => {
    const enc = encryptToken('secret', key);
    const buf = Buffer.from(enc, 'base64');
    const last = buf.length - 1;
    buf[last] = (buf[last] ?? 0) ^ 0xff; // 마지막 바이트 변조
    expect(() => decryptToken(buf.toString('base64'), key)).toThrow();
  });
});

describe('키 디코드', () => {
  it('hex 64자 → 32바이트', () => {
    const hex = randomBytes(32).toString('hex');
    expect(decodeKey(hex).length).toBe(32);
  });

  it('base64 32바이트 → 32바이트', () => {
    const b64 = generateKeyBase64();
    expect(decodeKey(b64).length).toBe(32);
  });

  it('잘못된 길이 키는 에러', () => {
    expect(() => decodeKey('too-short')).toThrow();
  });

  it('generateKeyBase64 로 만든 키로 왕복 성공', () => {
    const k = decodeKey(generateKeyBase64());
    expect(decryptToken(encryptToken('x', k), k)).toBe('x');
  });
});
