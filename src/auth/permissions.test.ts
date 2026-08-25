import { describe, it, expect } from 'vitest';
import {
  authorize,
  canEditRecruitNotice,
  ownsResource,
  isPrivileged,
  isStaffPlus,
  type ActorTeam,
  type Actor,
  type Action,
  type Role,
} from './permissions';
import { buildAuditEntry } from './audit';
import { requireAuthorized, guardWrite, PermissionError, isManagementAction } from './guard';

/** 테스트용 팀 소속. 공고 편집 권한은 기본 꺼짐(플래그를 켜는 테스트만 명시한다). */
function team(teamId: string, position: 'leader' | 'member', canEditNotice = false): ActorTeam {
  return { teamId, position, canEditNotice };
}

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
const teamOwned: Action = { kind: 'post.modify', owner: { ownerType: 'team', ownerId: 't-1' } };
const teamDoc: Action = { kind: 'document.modify', owner: { ownerType: 'team', ownerId: 't-1' } };

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

  it('9. 소속 팀원(운영진)의 팀 소유 게시물 수정 → 허용', () => {
    const a = actor('staff', { teams: [team('t-1', 'member')] });
    expect(authorize(a, teamOwned)).toMatchObject({ allowed: true, override: false });
  });

  it('10. 비소속 운영진의 팀 소유 게시물 수정 → 거부(not_owner)', () => {
    const a = actor('staff', { teams: [team('t-2', 'leader')] });
    expect(authorize(a, teamOwned)).toMatchObject({ allowed: false, reason: 'not_owner' });
  });

  it('10-1. 챗봇 문서 관리는 회장단 전용: 운영진(소속 팀원)도 거부, 회장단은 허용', () => {
    const staffOwner = actor('staff', { teams: [team('t-1', 'leader')] });
    expect(authorize(staffOwner, teamDoc)).toMatchObject({ allowed: false, reason: 'role_insufficient' });
    expect(authorize(actor('member'), teamDoc).reason).toBe('role_insufficient');
    expect(authorize(actor('board'), teamDoc).allowed).toBe(true);
    expect(authorize(actor('sysadmin'), teamDoc).allowed).toBe(true);
  });

  it('10-2. 동아리 일정 등록·수정은 회장단 전용(운영진은 보기만 — 조회는 authorize 를 타지 않는다)', () => {
    const manage: Action = { kind: 'schedule.manage' };
    expect(authorize(actor('member'), manage)).toMatchObject({ allowed: false, reason: 'role_insufficient' });
    expect(authorize(actor('staff'), manage)).toMatchObject({ allowed: false, reason: 'role_insufficient' });
    expect(authorize(actor('board'), manage).allowed).toBe(true);
    expect(authorize(actor('sysadmin'), manage).allowed).toBe(true);
    // 임기가 끝난 회장단은 쓰기 전면 거부(모든 쓰기의 첫 관문).
    expect(authorize(actor('board', { membershipActive: false }), manage)).toMatchObject({
      allowed: false,
      reason: 'membership_inactive',
    });
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

  it('14. 반복 규칙: 소속 팀장단은 허용, 비소속 운영진은 not_owner, 부원은 role_insufficient', () => {
    const rule = { kind: 'recurring.manage', owner: { ownerType: 'team', ownerId: 't-1' } } as const;
    const leader = actor('staff', { teams: [team('t-1', 'leader')] });
    expect(authorize(leader, rule).allowed).toBe(true);
    expect(authorize(actor('staff', { teams: [team('t-2', 'leader')] }), rule).reason).toBe('not_owner');
    expect(authorize(actor('member'), rule).reason).toBe('role_insufficient');
    expect(authorize(actor('board'), rule)).toMatchObject({ allowed: true, override: true });
  });

  // F9 신입 모집: 채점은 운영진, 결정은 회장단.
  it('15. recruit.score(채점·메모) = 운영진 이상: 부원 거부, 운영진·회장단 허용', () => {
    expect(authorize(actor('member'), { kind: 'recruit.score' }).reason).toBe('role_insufficient');
    expect(authorize(actor('staff'), { kind: 'recruit.score' }).allowed).toBe(true);
    expect(authorize(actor('board'), { kind: 'recruit.score' }).allowed).toBe(true);
  });

  // 결정 140 — 홍보팀 개방. 판단 근거는 팀 **이름**이 아니라 teams.can_edit_notice 플래그다.
  // (옛 isPRTeamOrPrivileged 는 UUID 를 이름처럼 비교해 항상 false 였고, 테스트는 teamId 에
  //  'pr_team' 이라는 가짜 문자열을 넣어 통과했다 — 같은 함정을 반복하지 않으려고 여기서
  //  플래그가 꺼진 팀·다른 팀·부원까지 전부 못 박는다.)
  it('16-1. recruit.notice = 회장단 + 공고 편집 플래그가 켜진 팀', () => {
    expect(authorize(actor('board'), { kind: 'recruit.notice' }).allowed).toBe(true);
    expect(authorize(actor('sysadmin'), { kind: 'recruit.notice' }).allowed).toBe(true);
    const pr = actor('staff', { teams: [team('t-pr', 'member', true)] });
    expect(authorize(pr, { kind: 'recruit.notice' }).allowed).toBe(true);
    // 팀장단이 아니어도 된다(공고는 팀원이 쓴다).
    expect(authorize(actor('staff', { teams: [team('t-pr', 'leader', true)] }), { kind: 'recruit.notice' }).allowed).toBe(true);
  });

  it('16-2. recruit.notice = 플래그 없는 팀의 운영진·부원은 거부', () => {
    const plainStaff = actor('staff', { teams: [team('t-1', 'leader')] });
    expect(authorize(plainStaff, { kind: 'recruit.notice' }).reason).toBe('role_insufficient');
    expect(authorize(actor('staff'), { kind: 'recruit.notice' }).reason).toBe('role_insufficient');
    // 플래그가 켜진 팀에 속해 있어도 부원이면 안 된다(팀 배정은 원래 staff 승격을 동반한다).
    expect(authorize(actor('member', { teams: [team('t-pr', 'member', true)] }), { kind: 'recruit.notice' }).reason).toBe(
      'role_insufficient'
    );
  });

  it('16-3. recruit.notice = 임기 만료면 플래그가 켜져 있어도 거부', () => {
    const expired = actor('staff', { membershipActive: false, teams: [team('t-pr', 'member', true)] });
    expect(authorize(expired, { kind: 'recruit.notice' }).reason).toBe('membership_inactive');
  });

  it('16-4. 홍보팀이어도 recruit.manage(확정·공개·폐기)는 여전히 거부', () => {
    const pr = actor('staff', { teams: [team('t-pr', 'member', true)] });
    expect(authorize(pr, { kind: 'recruit.manage' }).reason).toBe('role_insufficient');
    // 헬퍼 자체도 같은 경계를 지킨다.
    expect(canEditRecruitNotice(pr)).toBe(true);
    expect(isPrivileged(pr.role)).toBe(false);
  });

  // 기수는 **생성만** 홍보팀에게 열려 있다(결정 140). 삭제 라우트는 authorize 를 거치지 않고
  // isPrivileged 로 직접 가르므로, 여기서 못 박는 것은 "두 권한이 같은 값이 아니다"라는 사실이다 —
  // 나중에 삭제 게이트를 canEditRecruitNotice 로 바꾸면 이 테스트가 근거로 남는다.
  it('16-5. 기수 생성(recruit.notice)과 삭제(회장단)는 서로 다른 칸이다', () => {
    const pr = actor('staff', { teams: [team('t-pr', 'member', true)] });
    expect(canEditRecruitNotice(pr)).toBe(true); // 생성 O
    expect(isPrivileged(pr.role)).toBe(false); // 삭제 X
    const board = actor('board');
    expect(canEditRecruitNotice(board)).toBe(true);
    expect(isPrivileged(board.role)).toBe(true);
  });

  it('16. recruit.manage(업로드·확정·배정·공개·폐기) = 회장단 전용: 운영진도 거부', () => {
    expect(authorize(actor('staff'), { kind: 'recruit.manage' }).reason).toBe('role_insufficient');
    expect(authorize(actor('member'), { kind: 'recruit.manage' }).reason).toBe('role_insufficient');
    expect(authorize(actor('board'), { kind: 'recruit.manage' }).allowed).toBe(true);
    expect(authorize(actor('sysadmin'), { kind: 'recruit.manage' }).allowed).toBe(true);
  });

  it('17. 임기 만료 운영진은 채점도 거부(membership_inactive)', () => {
    expect(authorize(actor('staff', { membershipActive: false }), { kind: 'recruit.score' }).reason).toBe(
      'membership_inactive'
    );
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
    const a = actor('staff', { teams: [team('t-1', 'member')] });
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
    expect(isManagementAction({ kind: 'recruit.manage' })).toBe(true);
    expect(isManagementAction({ kind: 'recruit.score' })).toBe(false);
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
