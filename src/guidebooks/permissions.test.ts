// 가이드북 권한 — "그 팀의 팀장단 + 회장단"이 정확히 지켜지는지.
// 이 검사가 무너지면 남의 팀 가이드북을 갈아치울 수 있고, 그 본문은 곧바로 챗봇이 읽는다.

import { describe, expect, it } from 'vitest';
import { authorize, type Actor } from '@/auth/permissions';

const TEAM_A = '11111111-1111-1111-1111-111111111111';
const TEAM_B = '22222222-2222-2222-2222-222222222222';

function actor(over: Partial<Actor> = {}): Actor {
  return {
    userId: 'u1',
    role: 'staff',
    membershipActive: true,
    teams: [],
    ...over,
  };
}

const manageA = { kind: 'guidebook.manage', owner: { ownerType: 'team', ownerId: TEAM_A } } as const;

describe('guidebook.manage', () => {
  it('그 팀 팀장단은 허용', () => {
    const a = actor({ teams: [{ teamId: TEAM_A, position: 'leader' }] });
    expect(authorize(a, manageA)).toMatchObject({ allowed: true, override: false });
  });

  it('같은 팀이어도 팀원(member)은 거부 — 팀이 밖에 내놓는 자료다', () => {
    const a = actor({ teams: [{ teamId: TEAM_A, position: 'member' }] });
    expect(authorize(a, manageA)).toMatchObject({ allowed: false, reason: 'not_owner' });
  });

  it('다른 팀 팀장단은 거부', () => {
    const a = actor({ teams: [{ teamId: TEAM_B, position: 'leader' }] });
    expect(authorize(a, manageA)).toMatchObject({ allowed: false, reason: 'not_owner' });
  });

  it('부원은 팀장단이어도 거부(역할이 먼저)', () => {
    const a = actor({ role: 'member', teams: [{ teamId: TEAM_A, position: 'leader' }] });
    expect(authorize(a, manageA)).toMatchObject({ allowed: false, reason: 'role_insufficient' });
  });

  it('회장단은 남의 팀도 허용하되 override 로 남긴다', () => {
    const a = actor({ role: 'board', teams: [] });
    expect(authorize(a, manageA)).toMatchObject({ allowed: true, override: true });
  });

  it('회장단이 자기 팀 가이드북을 만지면 override 가 아니다', () => {
    const a = actor({ role: 'board', teams: [{ teamId: TEAM_A, position: 'leader' }] });
    expect(authorize(a, manageA)).toMatchObject({ allowed: true, override: false });
  });

  it('임기 만료(멤버십 비활성)면 팀장단이어도 거부', () => {
    const a = actor({ membershipActive: false, teams: [{ teamId: TEAM_A, position: 'leader' }] });
    expect(authorize(a, manageA)).toMatchObject({ allowed: false, reason: 'membership_inactive' });
  });

  it('개인 소유 가이드북은 존재하지 않는다(팀 소유만)', () => {
    const a = actor({ teams: [{ teamId: TEAM_A, position: 'leader' }] });
    const personal = { kind: 'guidebook.manage', owner: { ownerType: 'personal', ownerId: 'u1' } } as const;
    expect(authorize(a, personal)).toMatchObject({ allowed: false, reason: 'not_owner' });
  });
});
