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

  it('세션 세대(sv)가 토큰에 담기고 검증 후에도 그대로 나온다', () => {
    const token = signSession({ sub: 'u-1', role: 'board', sv: 7 }, SECRET);
    expect(verifySession(token, SECRET)!.sv).toBe(7);
  });

  it('sv 를 안 주면 0(초기 세대)', () => {
    expect(verifySession(signSession({ sub: 'u-1', role: 'member' }, SECRET), SECRET)!.sv).toBe(0);
  });

  it('sv 가 없는 옛 토큰도 0 으로 읽는다(이 배포 전에 발급된 세션 호환)', () => {
    // sv 필드가 아예 없는 payload 를 같은 시크릿으로 직접 서명해 재현한다.
    const { createHmac } = require('node:crypto') as typeof import('node:crypto');
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const head = b64({ alg: 'HS256', typ: 'JWT' });
    const body = b64({ sub: 'u-old', role: 'staff', iat: now, exp: now + 600 });
    const sig = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');

    const p = verifySession(`${head}.${body}.${sig}`, SECRET);
    expect(p).not.toBeNull();
    expect(p!.sv).toBe(0);
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
