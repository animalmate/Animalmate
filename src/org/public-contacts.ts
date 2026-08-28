// 공개 CONTACT 화면(/contact)에 올리는 사람 목록.
//
// **이름만** 내보낸다. 이 화면은 로그인 없이 누구나 보고 검색엔진·수집 봇도 긁어가므로
// 이메일·전화번호는 싣지 않는다(규칙 #4 — 개인 연락처를 공개 표면에 올리지 않는다).
// 지원자가 실제로 연락하는 창구는 인스타그램 DM·카카오톡 채널이고, 그 둘은 화면에 있다.

import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '@/db/types';
import { memberships, teamMembers, teams, users } from '@/db/schema';
import { rankLabel } from './team-leaders';

/** 한 줄 = 직함 하나 + 그 직함을 가진 사람들. */
export interface ContactGroup {
  label: string;
  names: string[];
}

/**
 * 회장단은 **역할로만** 고른다(`role = 'board'`).
 *
 * 이 한 줄이 개발자를 걸러 낸다: 시스템관리자(sysadmin)는 권한 등급이 회장단과 같지만
 * 동아리 운영진이 아니라 이 앱을 만든 사람이다. `isPrivileged`(board+sysadmin)로 물었다면
 * 개발자가 회장단 명단에 끼어 공개 화면에 실명이 올라갔을 것이다.
 * 회장단 안의 직책(회장·부회장·총무)은 구분하지 않는다 — 세 사람을 나란히 보여 줄 뿐이다(사용자 결정).
 */
export const BOARD_LABEL = '회장단';

/**
 * 대외 문의 창구 팀. **팀 이름으로 찾는다** — 07-DECISIONS 66 이 경고한 방식이지만
 * 여기서는 권한이 아니라 표시라서 다르다: 팀 이름이 바뀌면 CONTACT 에서 그 줄이 사라질 뿐,
 * 권한이 조용히 새거나 잠기지 않는다. 팀 이름을 바꿨는데 줄이 사라지면 이 상수 한 줄을 고친다.
 */
export const OUTREACH_TEAM_NAME = '대외사업팀';

/** 이름 목록 정리 — 빈 이름을 버리고, 앞뒤 공백을 다듬고, 가나다순으로 세운다. */
export function tidyNames(rows: { name: string }[]): string[] {
  return rows
    .map((r) => r.name.trim())
    .filter((n) => n.length > 0)
    .sort((a, b) => a.localeCompare(b, 'ko'));
}

/**
 * 대외사업팀 팀장단 중 **한 명**을 고른다(팀장 → 부팀장 → 기타, 같은 순위면 이름순).
 * 여러 명이어도 공개 화면에는 대표 한 명만 올린다 — 문의 창구가 여럿이면 어디로 가야 할지 모른다.
 */
export function pickOutreachLead(
  rows: { label: string | null; name: string }[]
): ContactGroup | null {
  const sorted = rows
    .filter((r) => r.name.trim())
    .sort((a, b) => rankLabel(a.label) - rankLabel(b.label) || a.name.localeCompare(b.name, 'ko'));
  const top = sorted[0];
  if (!top) return null;
  const label = (top.label ?? '').trim() || '팀장단';
  return { label: `${OUTREACH_TEAM_NAME} ${label}`, names: [top.name.trim()] };
}

/**
 * 공개 CONTACT 명단(회장단 + 대외사업팀 팀장). 사람이 없는 줄은 아예 넣지 않는다 —
 * 화면이 빈 딱지를 그리지 않게 하려는 것이다. 탈퇴 계정과 만료된 멤버십은 제외한다.
 */
export async function loadPublicContacts(db: Db): Promise<ContactGroup[]> {
  const [boardRows, leadRows] = await Promise.all([
    db
      .select({ name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.role, 'board'), // sysadmin(개발자) 제외 — 위 BOARD_LABEL 주석 참고
          eq(memberships.status, 'active'),
          isNull(users.withdrawnAt)
        )
      ),
    db
      .select({ label: teamMembers.label, name: users.name })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .where(
        and(
          eq(teams.name, OUTREACH_TEAM_NAME),
          eq(teamMembers.position, 'leader'),
          isNull(users.withdrawnAt)
        )
      ),
  ]);

  const groups: ContactGroup[] = [];
  const board = tidyNames(boardRows);
  if (board.length > 0) groups.push({ label: BOARD_LABEL, names: board });
  const outreach = pickOutreachLead(leadRows);
  if (outreach) groups.push(outreach);
  return groups;
}
