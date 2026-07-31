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
});
