import { describe, it, expect } from 'vitest';
import { clientIp, RULES, storedIdentifier } from './rate-limit';

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

  // ── 공유 IP 뒤의 단체 가입 ────────────────────────────────────────────
  // 실사용 개시일 저녁에 운영진 수십 명이 한자리에서(같은 WiFi) 가입한다. 통신사 CGNAT 도
  // 마찬가지로 여러 명을 한 공인 IP 로 묶는다. **IP 단위 상한이 인원수보다 작으면 가입 자체가 막힌다** —
  // 예전 값(시간당 10)이 정확히 그랬다. 아래 값들은 그 사고를 다시 못 내게 고정한다.
  const CLUB_SIZE = 30; // 한자리에서 가입시킬 수 있는 최대 인원(운영진 규모)

  it('IP 단위 상한은 한자리에 모인 인원(30명)보다 넉넉하다 — 단체 가입이 막히지 않게', () => {
    expect(RULES.signupRequest.max).toBeGreaterThanOrEqual(CLUB_SIZE);
    expect(RULES.loginRequest.max).toBeGreaterThanOrEqual(CLUB_SIZE);
    expect(RULES.otpVerify.max).toBeGreaterThanOrEqual(CLUB_SIZE);
  });

  it('가입코드 대입 방어는 IP 전체 요청이 아니라 **오답 전용 버킷**이 맡는다', () => {
    // 정상 가입자와 공격자가 같은 통을 나눠 쓰면 둘 중 하나를 포기해야 한다.
    // 오답만 세므로 코드를 아는 사람은 몇 명이든 이 통을 건드리지 않는다.
    expect(RULES.signupCodeFail.bucket).toBe('signup_code_fail');
    expect(RULES.signupCodeFail.bucket).not.toBe(RULES.signupRequest.bucket);
  });

  it('오답 통도 IP 단위라 한자리 인원(30명)의 오타를 감당하되, 무제한은 아니다', () => {
    // 코드를 불러 주면 `0`/`O` 처럼 여러 명이 똑같이 틀린다 — 통이 좁으면 정직한 오타가
    // "코드가 틀렸다" 대신 429 를 본다. 반대로 상한이 없으면 대입 오라클이 열린다.
    expect(RULES.signupCodeFail.max).toBeGreaterThanOrEqual(CLUB_SIZE);
    expect(RULES.signupCodeFail.max).toBeLessThanOrEqual(100);
    // 가입코드는 최소 6자 [A-Z0-9] ≈ 22억 가지다. 이 정도 시도로는 무차별 대입이 성립하지 않는다.
    expect(RULES.signupCodeFail.max).toBeLessThan(36 ** 6 / 1_000_000);
  });

  it('OTP 무차별 대입은 **주소 단위**로 막는다(IP 를 바꿔 가며 시도해도 대상 주소로 묶이게)', () => {
    expect(RULES.otpVerifyEmail.bucket).toBe('otp_verify_email');
    // 한 주소가 받을 수 있는 코드가 시간당 5개(mailToAddress)이고 코드당 5회(otp.ts)이므로,
    // 주소 단위 상한은 그 곱(25)을 넘지 않아야 실질적인 제약이 된다.
    expect(RULES.otpVerifyEmail.max).toBeLessThanOrEqual(RULES.mailToAddress.max * 5);
  });

  // 결과 조회 표적 잠금(2026-10-17 보안 감사): 이름만으로 세면 남의 이름으로 틀린 번호를 10번 넣는
  // 것만으로 그 사람이 1시간 동안 결과를 못 봤다. 한 곳에서 깎을 수 있는 것은 자기 통뿐이어야 하고,
  // 대상 단위 통은 IP 여럿을 동원해야 닿는 크기여야 한다.
  it('결과 조회 실패는 (IP+이름) 통이 먼저 막고, 이름 통은 그보다 훨씬 넓은 뒷받침이다', () => {
    expect(RULES.recruitLookupFailIp.bucket).not.toBe(RULES.recruitLookupFail.bucket);
    expect(RULES.recruitLookupFail.max).toBeGreaterThanOrEqual(RULES.recruitLookupFailIp.max * 10);
    // 휴대폰 뒤 8자리(1억 가지)에 견줘 하루 내내 시도해도 무의미한 크기
    expect(RULES.recruitLookupFail.max * 24).toBeLessThan(100_000_000 / 1000);
  });

  it('챗봇 질문은 회원 단위 원자적 상한을 가진다 — 동시 요청으로 일일 쿼터를 건너뛰지 못하게', () => {
    expect(RULES.chatbotAsk.bucket).toBe('chatbot_ask');
    expect(RULES.chatbotAsk.windowSeconds).toBeLessThanOrEqual(60);
  });
});

describe('storedIdentifier — 검증 전 값으로 리밋을 건너뛰지 못하게', () => {
  it('정상 값(IP·주소·HMAC)은 그대로 둔다 — 운영 점검·테스트 정리가 원문으로 찾는다', () => {
    for (const v of ['203.0.113.9', 'someone@example.com', 'ratelimit-test-다른IP', 'a'.repeat(128)]) {
      expect(storedIdentifier(v)).toBe(v);
    }
  });

  it('너무 길거나 제어문자가 섞인 값은 고정 길이 해시로 바꾼다(INSERT 실패 → fail-open 방지)', () => {
    const long = 'x'.repeat(5000);
    const nul = 'victim\u0000@example.com';
    expect(storedIdentifier(long)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(storedIdentifier(nul)).toMatch(/^sha256:[0-9a-f]{64}$/);
    // 같은 값은 같은 통에 모인다
    expect(storedIdentifier(long)).toBe(storedIdentifier('x'.repeat(5000)));
    expect(storedIdentifier(long)).not.toBe(storedIdentifier('y'.repeat(5000)));
  });
});
