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

  it('rate limit rules contain recruitApply bucket', () => {
    expect(RULES.recruitApply).toBeDefined();
    expect(RULES.recruitApply.max).toBe(5);
    expect(RULES.recruitApply.windowSeconds).toBe(600);
  });
});
