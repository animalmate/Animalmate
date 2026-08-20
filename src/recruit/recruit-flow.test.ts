import { describe, it, expect } from 'vitest';
import { isPrivileged, isStaffPlus } from '@/auth/permissions';
import { escapeHtml } from '@/naver/cafe-write';
import { RULES } from '@/http/rate-limit';

describe('Recruit Flow & Permissions Tests', () => {
  // 09-RECRUIT-DESIGN §0: 채점은 운영진, 결정은 회장단.
  // 운영진이 확정·공개 스위치를 건드릴 수 없다는 것을 여기서 고정한다.
  it('결정 권한(recruit.manage)은 회장단·시스템관리자뿐이다', () => {
    expect(isPrivileged('board')).toBe(true);
    expect(isPrivileged('sysadmin')).toBe(true);
    expect(isPrivileged('staff')).toBe(false);
    expect(isPrivileged('member')).toBe(false);
  });

  it('isStaffPlus correctly allows staff, board, and sysadmin', () => {
    expect(isStaffPlus('staff')).toBe(true);
    expect(isStaffPlus('board')).toBe(true);
    expect(isStaffPlus('sysadmin')).toBe(true);
    expect(isStaffPlus('member')).toBe(false);
  });

  it('escapeHtml prevents script injection attacks', () => {
    const maliciousInput = '<script>alert("hack")</script> Hello & "World"';
    const clean = escapeHtml(maliciousInput);
    expect(clean).not.toContain('<script>');
    expect(clean).toContain('&lt;script&gt;');
    expect(clean).toContain('&amp;');
  });

  it('지원서 제출에 상한이 있다(자동화 도배 차단)', () => {
    expect(RULES.recruitApply).toBeDefined();
    expect(RULES.recruitApply.max).toBeGreaterThan(0);
    expect(RULES.recruitApply.windowSeconds).toBe(600);
  });

  it('지원서 상한은 한 IP 뒤 단체 접수를 감당한다 — 그래도 사람 속도로 좁다', () => {
    // 학교 WiFi·통신사 CGNAT 뒤에서 여러 명이 지원한다. 상한이 인원보다 작으면
    // 그 사람들은 **지원 자체를 못 한다**(2026-07-31 QA — 가입에서 같은 사고가 있었다).
    // 중복 지원은 이 값이 아니라 이름+전화 409 가 막으므로 올려도 중복은 늘지 않는다.
    expect(RULES.recruitApply.max).toBeGreaterThanOrEqual(30);
    // 분당 환산이 사람 속도를 넘지 않아야 자동화 도배는 계속 막힌다.
    const perMinute = RULES.recruitApply.max / (RULES.recruitApply.windowSeconds / 60);
    expect(perMinute).toBeLessThanOrEqual(5);
  });

  // ── 결과 조회 총량(IP) ────────────────────────────────────────────────
  // 지원서 제출과 같은 이유(공유 IP)에 **발표 직후**라는 사정이 더 붙는다 — 모두가 같은 순간에
  // 확인하는 1분이라, 상한이 인원보다 작으면 정상 지원자가 자기 결과를 못 본다.
  const SHARED_IP_PEERS = 30; // 한 공인 IP 뒤에서 같은 분에 조회할 수 있는 인원(학교 WiFi·기숙사·CGNAT)
  const TRIES_PER_PERSON = 2; // 한 사람이 한 번만 누르지 않는다(오타·새로고침·다시 보기)

  it('조회 총량은 한 IP 뒤 인원 × 재시도를 감당한다 — 발표 직후가 이 통이 가장 몰리는 순간이다', () => {
    expect(RULES.recruitLookup.max).toBeGreaterThanOrEqual(SHARED_IP_PEERS * TRIES_PER_PERSON);
    // 그래도 무제한은 아니다. 초당 2회를 넘으면 사람이 아니라 자동화다.
    const perSecond = RULES.recruitLookup.max / RULES.recruitLookup.windowSeconds;
    expect(perSecond).toBeLessThanOrEqual(2);
  });

  it('조회 총량의 창은 짧게 유지한다 — 막히더라도 1분이면 풀려야 한다', () => {
    // 창을 넓히면(예: 5분 300회) 소진했을 때 발표날 저녁에 그만큼을 기다리게 된다.
    expect(RULES.recruitLookup.windowSeconds).toBeLessThanOrEqual(60);
  });

  it('열거 방어는 총량(IP)이 아니라 대상(이름) 통이 맡는다 — 총량을 넓혀도 흔들리지 않는다', () => {
    // 결정 80. 이 분리가 있어야 위의 상한을 인원에 맞춰 올릴 수 있다.
    expect(RULES.recruitLookupFail.bucket).not.toBe(RULES.recruitLookup.bucket);
    // 특정인을 노리는 반복은 여전히 좁다 — 전화 11자리 조합에 견줘 시간당 10회는 무의미한 크기다.
    expect(RULES.recruitLookupFail.max).toBeLessThanOrEqual(10);
    expect(RULES.recruitLookupFail.windowSeconds).toBe(3600);
  });
});
