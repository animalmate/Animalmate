import { describe, it, expect } from 'vitest';
import { clientIp, RULES } from './rate-limit';

describe('clientIp', () => {
  it('Vercel 이 직접 넣는 헤더를 최우선으로 쓴다(위조 불가한 출처)', () => {
    const h = new Headers({
      'x-vercel-forwarded-for': '203.0.113.9',
      'x-forwarded-for': '10.0.0.1', // 클라이언트가 위조해 보낸 값
      'x-real-ip': '10.0.0.2',
    });
    expect(clientIp(h)).toBe('203.0.113.9');
  });

  it('여러 개면 첫 번째(원 클라이언트)를 쓴다', () => {
    expect(clientIp(new Headers({ 'x-vercel-forwarded-for': '203.0.113.9, 70.41.3.18' }))).toBe('203.0.113.9');
  });

  it('Vercel 헤더가 없으면 x-real-ip → x-forwarded-for 순으로 대체', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7');
    expect(clientIp(new Headers({ 'x-forwarded-for': '198.51.100.8' }))).toBe('198.51.100.8');
  });

  it('아무 헤더도 없으면 unknown 으로 묶는다(로컬 개발 등 — 그래도 리밋은 동작)', () => {
    expect(clientIp(new Headers())).toBe('unknown');
  });
});

describe('RULES', () => {
  it('가입/로그인 요청과 OTP 검증에 모두 상한이 있다', () => {
    for (const rule of Object.values(RULES)) {
      expect(rule.max).toBeGreaterThan(0);
      expect(rule.windowSeconds).toBeGreaterThan(0);
    }
  });

  it('가입·로그인 OTP 검증은 같은 버킷을 공유한다(둘을 번갈아 써서 상한을 2배로 못 쓰게)', () => {
    // 두 라우트가 모두 RULES.otpVerify 를 쓰므로 버킷 이름은 하나뿐이다.
    expect(RULES.otpVerify.bucket).toBe('otp_verify');
    expect(RULES.signupRequest.bucket).not.toBe(RULES.otpVerify.bucket);
  });
});
