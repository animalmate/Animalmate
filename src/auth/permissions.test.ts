import { describe, it, expect } from 'vitest';
import {
  authorize,
  ownsResource,
  isPrivileged,
  isStaffPlus,
  type Actor,
  type Action,
  type Role,
} from './permissions';
import { buildAuditEntry } from './audit';
import { requireAuthorized, guardWrite, PermissionError, isManagementAction } from './guard';

// 테스트용 actor 팩토리. 기본은 활성 멤버십.
function actor(role: Role, opts: Partial<Actor> = {}): Actor {
  return {
    userId: opts.userId ?? 'u-self',
    role,
    membershipActive: opts.membershipActive ?? true,
    teams: opts.teams ?? [],
  };
}

const personalSelf: Action = { kind: 'post.modify', owner: { ownerType: 'personal', ownerId: 'u-self' } };
const personalOther: Action = { kind: 'post.modify', owner: { ownerType: 'personal', ownerId: 'u-other' } };
const teamOwned: Action = { kind: 'document.modify', owner: { ownerType: 'team', ownerId: 't-1' } };

describe('authorize — 권한 매트릭스 (03 접근 규칙 / PRD §4)', () => {
  // DoD 예시: 부원이 운영진 API 호출 시 거부(403).
  it('1. 부원의 게시물 생성 → 거부(role_insufficient)', () => {
    expect(authorize(actor('member'), { kind: 'post.create' })).toMatchObject({
      allowed: false,
      reason: 'role_insufficient',
    });
  });

  it('2. 운영진의 게시물 생성 → 허용', () => {
    expect(authorize(actor('staff'), { kind: 'post.create' }).allowed).toBe(true);
  });

  it('3. 운영진이 남의 개인 소유 게시물 수정 → 거부(not_owner)', () => {
    expect(authorize(actor('staff'), personalOther)).toMatchObject({
      allowed: false,
      reason: 'not_owner',
    });
  });

  it('4. 운영진이 본인 소유 게시물 수정 → 허용(override 아님)', () => {
    expect(authorize(actor('staff'), personalSelf)).toMatchObject({ allowed: true, override: false });
  });

  it('5. 회장단이 남의 소유 게시물 수정 → 허용 + override=true', () => {
    expect(authorize(actor('board'), personalOther)).toMatchObject({ allowed: true, override: true });
  });

  it('6. 부원의 운영진 임명 → 거부(role_insufficient)', () => {
    expect(authorize(actor('member'), { kind: 'membership.manage' })).toMatchObject({
      allowed: false,
      reason: 'role_insufficient',
    });
  });

  // 추가 케이스(경계·팀 소유·만료·최고권한)
  it('7. 회장단의 운영진 임명 → 허용', () => {
    expect(authorize(actor('board'), { kind: 'membership.manage' }).allowed).toBe(true);
  });

  it('8. 임기 만료(membershipActive=false) 운영진 → 어떤 쓰기도 거부(membership_inactive)', () => {
    expect(authorize(actor('staff', { membershipActive: false }), { kind: 'post.create' })).toMatchObject({
      allowed: false,
      reason: 'membership_inactive',
    });
  });

  it('9. 소속 팀원(운영진)의 팀 소유 문서 수정 → 허용', () => {
    const a = actor('staff', { teams: [{ teamId: 't-1', position: 'member' }] });
    expect(authorize(a, teamOwned)).toMatchObject({ allowed: true, override: false });
  });

  it('10. 비소속 운영진의 팀 소유 문서 수정 → 거부(not_owner)', () => {
    const a = actor('staff', { teams: [{ teamId: 't-2', position: 'leader' }] });
    expect(authorize(a, teamOwned)).toMatchObject({ allowed: false, reason: 'not_owner' });
  });

  it('11. 시스템관리자의 봇 토큰 관리 → 허용', () => {
    expect(authorize(actor('sysadmin'), { kind: 'bot.token' }).allowed).toBe(true);
  });

  it('12. 활성 부원의 챗봇 질문/봉사 신청 → 허용', () => {
    expect(authorize(actor('member'), { kind: 'chatbot.ask' }).allowed).toBe(true);
    expect(authorize(actor('member'), { kind: 'application.create' }).allowed).toBe(true);
  });

  it('13. 운영진의 게시판 레지스트리/학기 전환 → 거부(회장단 전용)', () => {
    expect(authorize(actor('staff'), { kind: 'board.registry' }).reason).toBe('role_insufficient');
    expect(authorize(actor('staff'), { kind: 'term.transition' }).reason).toBe('role_insufficient');
  });
});

describe('헬퍼', () => {
  it('isPrivileged / isStaffPlus', () => {
    expect(isPrivileged('board')).toBe(true);
    expect(isPrivileged('sysadmin')).toBe(true);
    expect(isPrivileged('staff')).toBe(false);
    expect(isStaffPlus('staff')).toBe(true);
    expect(isStaffPlus('member')).toBe(false);
  });

  it('ownsResource — personal/team', () => {
    const a = actor('staff', { teams: [{ teamId: 't-1', position: 'member' }] });
    expect(ownsResource(a, { ownerType: 'personal', ownerId: 'u-self' })).toBe(true);
    expect(ownsResource(a, { ownerType: 'personal', ownerId: 'u-x' })).toBe(false);
    expect(ownsResource(a, { ownerType: 'team', ownerId: 't-1' })).toBe(true);
    expect(ownsResource(a, { ownerType: 'team', ownerId: 't-9' })).toBe(false);
  });
});

describe('guard — 예외 매핑 + audit 기록', () => {
  it('requireAuthorized 는 거부 시 PermissionError(status 403) 를 던진다', () => {
    try {
      requireAuthorized(actor('member'), { kind: 'post.create' });
      expect.unreachable('허용되면 안 됨');
    } catch (e) {
      expect(e).toBeInstanceOf(PermissionError);
      expect((e as PermissionError).status).toBe(403);
      expect((e as PermissionError).reason).toBe('role_insufficient');
    }
  });

  it('requireAuthorized 는 허용 시 Decision 을 반환한다', () => {
    expect(requireAuthorized(actor('staff'), { kind: 'post.create' }).allowed).toBe(true);
  });

  it('isManagementAction 판별', () => {
    expect(isManagementAction({ kind: 'membership.manage' })).toBe(true);
    expect(isManagementAction({ kind: 'post.create' })).toBe(false);
  });

  it('buildAuditEntry — override 시 action 에 [override] 표기, 값 매핑', () => {
    const e = buildAuditEntry({
      actorUserId: 'u-1',
      action: 'post.modify',
      targetTable: 'scheduled_posts',
      targetId: 'p-1',
      before: { title: 'a' },
      after: { title: 'b' },
      override: true,
    });
    expect(e).toEqual({
      actorUserId: 'u-1',
      action: 'post.modify [override]',
      targetTable: 'scheduled_posts',
      targetId: 'p-1',
      beforeJson: { title: 'a' },
      afterJson: { title: 'b' },
    });
  });

  // 가짜 db 로 audit 기록 여부만 검증(순수하게 side-effect 관찰).
  function fakeDb() {
    const inserted: unknown[] = [];
    const db = {
      insert: () => ({ values: async (v: unknown) => void inserted.push(v) }),
    } as never;
    return { db, inserted };
  }

  it('guardWrite — 관리 행위는 audit 1건 기록', async () => {
    const { db, inserted } = fakeDb();
    await guardWrite(db, actor('board'), { kind: 'membership.manage' }, { table: 'memberships', id: 'm-1' });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ action: 'membership.manage', targetTable: 'memberships' });
  });

  it('guardWrite — 회장단 override 수정은 [override] 로 audit 기록', async () => {
    const { db, inserted } = fakeDb();
    await guardWrite(db, actor('board'), personalOther, { table: 'scheduled_posts', id: 'p-1' });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ action: 'post.modify [override]' });
  });

  it('guardWrite — 소유자 본인 수정(비관리·비override)은 audit 기록 안 함', async () => {
    const { db, inserted } = fakeDb();
    await guardWrite(db, actor('staff'), personalSelf, { table: 'scheduled_posts', id: 'p-1' });
    expect(inserted).toHaveLength(0);
  });

  it('guardWrite — 거부 시 PermissionError, audit 기록 없음', async () => {
    const { db, inserted } = fakeDb();
    await expect(
      guardWrite(db, actor('member'), { kind: 'post.create' })
    ).rejects.toBeInstanceOf(PermissionError);
    expect(inserted).toHaveLength(0);
  });
});
