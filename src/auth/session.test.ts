import { describe, it, expect } from 'vitest';
import { signSession, verifySession } from './session';
import { generateOtp, hashOtp } from './otp';

const SECRET = 'test-session-secret';

describe('세션 JWT (HS256)', () => {
  it('서명 → 검증 = payload(sub/role)', () => {
    const token = signSession({ sub: 'u-1', role: 'staff' }, SECRET);
    const p = verifySession(token, SECRET);
    expect(p).toMatchObject({ sub: 'u-1', role: 'staff' });
    expect(p!.exp).toBeGreaterThan(p!.iat);
  });

  it('다른 시크릿 → null', () => {
    const token = signSession({ sub: 'u-1', role: 'member' }, SECRET);
    expect(verifySession(token, 'other')).toBeNull();
  });

  it('변조 토큰 → null', () => {
    const token = signSession({ sub: 'u-1', role: 'member' }, SECRET);
    const bad = token.slice(0, -2) + (token.endsWith('a') ? 'bb' : 'aa');
    expect(verifySession(bad, SECRET)).toBeNull();
  });

  it('만료 토큰 → null', () => {
    const token = signSession({ sub: 'u-1', role: 'member' }, SECRET, -10);
    expect(verifySession(token, SECRET)).toBeNull();
  });

  it('형식 오류/누락 → null', () => {
    expect(verifySession(null, SECRET)).toBeNull();
    expect(verifySession('not.a.jwt.x', SECRET)).toBeNull();
    expect(verifySession('only-one-part', SECRET)).toBeNull();
  });
});

describe('OTP 순수 부분', () => {
  it('generateOtp 는 6자리 숫자', () => {
    for (let i = 0; i < 50; i++) expect(generateOtp()).toMatch(/^\d{6}$/);
  });

  it('hashOtp 는 결정적이고 코드가 다르면 달라진다(평문 미포함)', () => {
    const a = hashOtp('x@y.com', '123456', SECRET);
    expect(hashOtp('x@y.com', '123456', SECRET)).toBe(a);
    expect(hashOtp('x@y.com', '654321', SECRET)).not.toBe(a);
    expect(a).not.toContain('123456');
  });

  it('이메일 대소문자 무시', () => {
    expect(hashOtp('X@Y.com', '111111', SECRET)).toBe(hashOtp('x@y.com', '111111', SECRET));
  });
});
