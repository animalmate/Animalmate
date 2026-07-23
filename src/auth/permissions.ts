// 권한 검사 — 순수 로직(부수효과 없음, 단위 테스트 필수: CLAUDE.md 코드 컨벤션).
//
// 근거:
//  - 03-DATA-MODEL 접근 규칙: 쓰기마다 인증 → membership active? → 역할 충족? → 소유권 충족?
//    회장단/시스템관리자는 소유권 우회 가능(단, audit 에 override 로 기록).
//  - 01-PRD §4 권한 요약표.
//  - 권한 검증은 서버에서 강제(규칙 #6). UI 숨김은 권한이 아니다.

import type { roleEnum, ownerTypeEnum } from '@/db/schema';

export type Role = (typeof roleEnum.enumValues)[number]; // member | staff | board | sysadmin
export type OwnerType = (typeof ownerTypeEnum.enumValues)[number]; // personal | team

export interface ActorTeam {
  teamId: string;
  position: 'leader' | 'member';
}

/** 요청자(인증된 사용자)의 권한 판단에 필요한 최소 컨텍스트. */
export interface Actor {
  userId: string;
  role: Role;
  /** memberships.status === 'active'. 임기 만료(expired) 면 false → 쓰기 전면 거부. */
  membershipActive: boolean;
  /** 소속 팀 목록(team_members). 팀 소유 리소스의 소유권 판단에 사용. */
  teams: ActorTeam[];
}

export interface Ownership {
  ownerType: OwnerType;
  ownerId: string; // personal = user_id, team = team_id
}

/** 판단 대상 행위. 소유권이 필요한 행위는 owner 를 포함한다. */
export type Action =
  | { kind: 'chatbot.ask' }
  | { kind: 'application.create' }
  | { kind: 'post.create' }
  | { kind: 'post.modify'; owner: Ownership } // 수정/삭제
  | { kind: 'document.modify'; owner: Ownership } // 수정/삭제
  | { kind: 'recurring.manage'; owner: Ownership } // 반복 규칙 CRUD(팀 소유)
  | { kind: 'membership.manage' } // 운영진 임명/해제
  | { kind: 'term.transition' } // 학기 전환
  | { kind: 'board.registry' } // 게시판 레지스트리
  | { kind: 'bot.token' }; // 봇 토큰 관리

export type DenyReason = 'membership_inactive' | 'role_insufficient' | 'not_owner';

export interface Decision {
  allowed: boolean;
  reason: 'ok' | DenyReason;
  /** 회장단/시스템관리자가 소유권을 우회해 허용된 경우 true → audit 에 override 로 기록(규칙). */
  override: boolean;
}

const ALLOW: Decision = { allowed: true, reason: 'ok', override: false };
const ALLOW_OVERRIDE: Decision = { allowed: true, reason: 'ok', override: true };
const deny = (reason: DenyReason): Decision => ({ allowed: false, reason, override: false });

/** 회장단·시스템관리자: 최고 권한(소유권 우회 가능). */
export function isPrivileged(role: Role): boolean {
  return role === 'board' || role === 'sysadmin';
}

/** 운영진 이상(게시물·예약 생성 등). */
export function isStaffPlus(role: Role): boolean {
  return role === 'staff' || isPrivileged(role);
}

/** 요청자가 해당 리소스의 소유자인가(personal=본인, team=소속 팀원). */
export function ownsResource(actor: Actor, owner: Ownership): boolean {
  if (owner.ownerType === 'personal') return owner.ownerId === actor.userId;
  return actor.teams.some((t) => t.teamId === owner.ownerId);
}

/**
 * 쓰기 행위 권한 판단(순수). 서버에서 이 결과로 실행 여부와 audit override 를 결정한다.
 */
export function authorize(actor: Actor, action: Action): Decision {
  // 규칙: 모든 쓰기는 membership active 를 먼저 요구(임기 만료 시 전면 거부).
  if (!actor.membershipActive) return deny('membership_inactive');

  switch (action.kind) {
    // 부원 이상 누구나(활성 멤버).
    case 'chatbot.ask':
    case 'application.create':
      return ALLOW;

    // 게시물·예약 생성: 운영진 이상(부원 불가).
    case 'post.create':
      return isStaffPlus(actor.role) ? ALLOW : deny('role_insufficient');

    // 게시물/문서 수정·삭제: 부원 불가. 회장단·시스템관리자는 소유권 우회(override).
    // 운영진은 소유자(본인/소속팀)일 때만.
    case 'post.modify':
    case 'document.modify':
    case 'recurring.manage': {
      if (!isStaffPlus(actor.role)) return deny('role_insufficient');
      if (isPrivileged(actor.role)) {
        return ownsResource(actor, action.owner) ? ALLOW : ALLOW_OVERRIDE;
      }
      return ownsResource(actor, action.owner) ? ALLOW : deny('not_owner');
    }

    // 회장단·시스템관리자 전용.
    case 'membership.manage':
    case 'term.transition':
    case 'board.registry':
    case 'bot.token':
      return isPrivileged(actor.role) ? ALLOW : deny('role_insufficient');
  }
}
