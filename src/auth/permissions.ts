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
  /** 표시용 이름. loadActor 가 이미 읽는 users 행에서 같이 나오므로 조회 비용이 0 이다.
   *  **권한 판단에는 절대 쓰지 않는다** — 화면이 이름 하나 때문에 users 를 다시 조회하지 않게
   *  하려는 값일 뿐이라, 권한만 보는 호출부(테스트 픽스처 등)는 채우지 않아도 되도록 optional 이다. */
  name?: string;
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
  | { kind: 'guidebook.manage'; owner: Ownership } // 팀 가이드북 업로드/교체/삭제(팀 소유)
  | { kind: 'schedule.manage' } // 동아리 일정(캘린더) 등록·수정·삭제 — 회장단 전용, 조회는 운영진 이상
  | { kind: 'recurring.manage'; owner: Ownership } // 반복 규칙/프리셋 CRUD(팀 소유)
  | { kind: 'template.manage'; owner: Ownership } // 발행 템플릿 CRUD(팀/개인 소유; global 은 별도 처리)
  | { kind: 'membership.manage' } // 운영진 임명/해제
  | { kind: 'term.transition' } // 학기 전환
  | { kind: 'board.registry' } // 게시판 레지스트리
  | { kind: 'bot.token' } // 봇 토큰 관리
  | { kind: 'joincode.manage' } // 학기 가입코드 발급/재발급
  | { kind: 'recruit.score' } // F9 신입 모집: 채점·개인메모·공용메모지(운영진 이상)
  | { kind: 'recruit.manage' }; // F9 신입 모집: 업로드·확정·배정·공개·폐기·export(회장단 전용)

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
 * 요청자가 그 팀의 **팀장단**인가(position='leader').
 *
 * `ownsResource` 와 다른 이유: 소유권은 "소속 팀원이면 참"이라 팀원 전원이 통과한다. 가이드북은
 * 팀이 대외적으로 내놓는 자료라 팀원 아무나 갈아치우면 안 된다 — 올리는 사람을 팀장단으로 좁힌다.
 */
export function leadsTeam(actor: Actor, teamId: string): boolean {
  return actor.teams.some((t) => t.teamId === teamId && t.position === 'leader');
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

    // 게시물·예약 생성, F9 채점/메모: 운영진 이상(부원 불가).
    // 채점은 운영진, 결정은 회장단 — recruit.score 는 여기(staff+), recruit.manage 는 아래(board only).
    case 'post.create':
    case 'recruit.score':
      return isStaffPlus(actor.role) ? ALLOW : deny('role_insufficient');

    // 게시물 수정·삭제, 반복 규칙/템플릿 관리: 부원 불가. 회장단·시스템관리자는 소유권 우회(override).
    // 운영진은 소유자(본인/소속팀)일 때만.
    case 'post.modify':
    case 'recurring.manage':
    case 'template.manage': {
      if (!isStaffPlus(actor.role)) return deny('role_insufficient');
      if (isPrivileged(actor.role)) {
        return ownsResource(actor, action.owner) ? ALLOW : ALLOW_OVERRIDE;
      }
      return ownsResource(actor, action.owner) ? ALLOW : deny('not_owner');
    }

    // 팀 가이드북: 그 팀의 **팀장단**과 회장단만. 문서(document.modify)와 갈라 둔 이유는
    // 주인이 다르기 때문이다 — 지식베이스 문서는 동아리 전체가 따르는 공식 정보라 회장단이 쥐지만,
    // 가이드북은 각 팀이 자기 팀 운영 방식을 적은 자료라 그 팀이 직접 관리하는 편이 낫다.
    // 팀원(position='member')은 제외한다: 팀이 밖에 내놓는 자료라 아무나 갈아치우면 안 된다.
    case 'guidebook.manage': {
      if (!isStaffPlus(actor.role)) return deny('role_insufficient');
      if (isPrivileged(actor.role)) {
        // 회장단은 남의 팀 가이드북도 손댈 수 있다. 자기 팀이 아니면 override 로 남긴다.
        return action.owner.ownerType === 'team' && leadsTeam(actor, action.owner.ownerId) ? ALLOW : ALLOW_OVERRIDE;
      }
      if (action.owner.ownerType !== 'team') return deny('not_owner'); // 가이드북은 팀 소유만 존재한다
      return leadsTeam(actor, action.owner.ownerId) ? ALLOW : deny('not_owner');
    }

    // 챗봇 지식베이스 문서: 관리(생성·수정·삭제)는 회장단·시스템관리자 전용(운영진·부원 불가).
    // 동아리 일정도 같다 — 일정은 동아리 전체가 따르는 공식 정보라 운영진이 각자 고치면 안 된다.
    // (운영진은 캘린더를 **읽을** 수 있고, 그 조회 범위는 visibility 가 따로 가른다.)
    case 'document.modify':
    case 'schedule.manage':
      return isPrivileged(actor.role) ? ALLOW : deny('role_insufficient');

    // 회장단·시스템관리자 전용.
    case 'membership.manage':
    case 'term.transition':
    case 'board.registry':
    case 'bot.token':
    case 'joincode.manage':
    case 'recruit.manage': // 결정은 회장단 — 운영진은 합격 여부를 바꿀 수 없다
      return isPrivileged(actor.role) ? ALLOW : deny('role_insufficient');
  }
}

// 제거됨: isPRTeamOrPrivileged (2026-07-27 검토).
// "홍보팀 소속이면 공고 편집·팀 이관 허용"을 의도했지만 `actor.teams[].teamId` 는 teams 테이블의
// **UUID** 라서 'pr'/'홍보' 부분 문자열이 들어갈 수 없었다(UUID 는 0-9a-f 만). 즉 항상 false 여서
// 실제로는 회장단 전용과 똑같이 동작했고, 단위 테스트는 teamId 에 'pr_team' 이라는 가짜 문자열을
// 넣어 통과하고 있었다(테스트가 실제 동작을 검증하지 못함).
// 호출부는 전부 isPrivileged 로 바꿨다 — 실제 동작은 그대로다.
// 홍보팀에 권한을 열려면 teamId 문자열이 아니라 teams.name 을 조회하는 검사를 새로 만들어야 한다.

