import { describe, it, expect } from 'vitest';
import { isPRTeamOrPrivileged, isStaffPlus, Actor } from '@/auth/permissions';
import { escapeHtml } from '@/naver/cafe-write';
import { RULES } from '@/http/rate-limit';

describe('Recruit Flow & Permissions Tests', () => {
  it('isPRTeamOrPrivileged correctly identifies PR team members, board, and sysadmin', () => {
    const sysadmin: Actor = {
      userId: 'user-1',
      role: 'sysadmin',
      membershipActive: true,
      teams: [],
    };
    expect(isPRTeamOrPrivileged(sysadmin)).toBe(true);

    const prStaff: Actor = {
      userId: 'user-2',
      role: 'staff',
      membershipActive: true,
      teams: [{ teamId: 'pr_team', position: 'member' }],
    };
    expect(isPRTeamOrPrivileged(prStaff)).toBe(true);

    const normalStaff: Actor = {
      userId: 'user-3',
      role: 'staff',
      membershipActive: true,
      teams: [{ teamId: 'volunteer_1', position: 'leader' }],
    };
    expect(isPRTeamOrPrivileged(normalStaff)).toBe(false);

    const inactiveSysadmin: Actor = {
      userId: 'user-4',
      role: 'sysadmin',
      membershipActive: false,
      teams: [],
    };
    expect(isPRTeamOrPrivileged(inactiveSysadmin)).toBe(false);
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
