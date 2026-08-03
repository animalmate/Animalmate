// 공개 범위 필터 — 문서와 일정이 함께 쓰는 보안 필터라 여기서 못 박는다.
// (test/rag-visibility.security.test.ts 는 실제 DB 로 "새지 않는다"를 따로 증명한다.)

import { describe, it, expect } from 'vitest';
import { allowedVisibilities, roleVisibilityRank, VISIBILITY_RANK } from './visibility';
import type { Actor, Role } from './permissions';

const actor = (role: Role): Actor => ({ userId: 'u', role, membershipActive: true, teams: [] });

describe('allowedVisibilities', () => {
  it('자기 등급 이하만 본다 — 부원은 부원 자료만', () => {
    expect(allowedVisibilities(actor('member'))).toEqual(['member']);
  });

  it('운영진은 부원·운영진 자료까지', () => {
    expect(allowedVisibilities(actor('staff')).sort()).toEqual(['member', 'staff']);
  });

  it('회장단·시스템관리자는 전부', () => {
    expect(allowedVisibilities(actor('board')).sort()).toEqual(['board', 'member', 'staff']);
    expect(allowedVisibilities(actor('sysadmin')).sort()).toEqual(['board', 'member', 'staff']);
  });

  it('등급 순위는 member < staff < board', () => {
    expect(VISIBILITY_RANK.member).toBeLessThan(VISIBILITY_RANK.staff);
    expect(VISIBILITY_RANK.staff).toBeLessThan(VISIBILITY_RANK.board);
    expect(roleVisibilityRank('board')).toBe(roleVisibilityRank('sysadmin'));
  });

  it('빈 목록을 돌려주지 않는다 — 아무도 못 보는 상태가 되면 화면이 통째로 비어 원인을 못 찾는다', () => {
    for (const role of ['member', 'staff', 'board', 'sysadmin'] as Role[]) {
      expect(allowedVisibilities(actor(role)).length).toBeGreaterThan(0);
    }
  });
});
