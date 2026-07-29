// 봉사 공지 {{팀장단}} 문구 생성.
//
// 두 출처를 합친다:
//  1) 자동 — team_members(position=leader) + users(이름·전화) + 직함(label). 회원 관리에서 배정.
//  2) 수동 — teams.leaders(미가입자 전용: 이름·전화). 앱에 없는 사람을 공지에만 넣을 때.
//
// 중복 방지(핵심): 수동으로 넣어 둔 사람이 나중에 가입·팀 배정되면 같은 사람이 두 번 나올 수 있다.
// → 전화번호(숫자만)로 같은 사람을 판정해, 자동 명단에 이미 있으면 수동 항목을 버린다.

import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db/types';
import { teamMembers, teams, users, type TeamLeader } from '@/db/schema';
import { leadersBlock } from '@/publishing/placeholders';

/** 전화번호 비교용 정규화 — 숫자만 남긴다('010-1234-5678' → '01012345678'). 빈 값이면 빈 문자열. */
export function normalizePhone(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '');
}

/** 공지 표시 순서: 팀장 → 부팀장 → 그 외. 같은 순위면 이름순. */
export function rankLabel(label: string | null | undefined): number {
  const l = (label ?? '').trim();
  if (l === '팀장') return 0;
  if (l === '부팀장') return 1;
  return 2;
}

/**
 * 자동 명단(가입 팀장단) + 수동 명단(미가입자)을 합쳐 표시용 목록으로.
 * - **출처와 무관하게** 직함 순(팀장→부팀장→기타), 같은 순위면 이름순.
 * - 전화번호가 이미 명단에 있으면(같은 사람) 버린다. 남는 쪽은 자동(가입 계정)이다.
 * - 이름·전화가 모두 비면 제외(공지에 보여줄 게 없음).
 */
export function mergeLeaders(members: TeamLeader[], extras: TeamLeader[]): TeamLeader[] {
  const out: TeamLeader[] = [];
  const seenPhones = new Set<string>();
  // 자동을 먼저 훑어야 같은 전화일 때 가입 계정 쪽이 남는다(이름·전화의 정본은 users 다).
  for (const e of [...members, ...extras]) {
    if (!e.name.trim() && !e.phone.trim()) continue; // 보여줄 내용 없음
    const p = normalizePhone(e.phone);
    if (p) {
      if (seenPhones.has(p)) continue; // 같은 전화 = 같은 사람 → 중복 제거
      seenPhones.add(p);
    }
    out.push(e);
  }
  // 정렬은 **합친 뒤 한 번에** 한다. 자동만 정렬하고 수동을 뒤에 붙이면, 가입자가 부팀장뿐인
  // 팀에서 "부팀장(자동) → 팀장(수동) → 부팀장(수동)" 이 나온다(2026-07-29 QA 에서 5팀이 그랬다).
  // 공지를 읽는 사람에게 중요한 것은 직함 순서지, 그 사람이 앱에 가입했는지가 아니다.
  // sort 는 안정 정렬이라 순위·이름이 같으면 자동이 앞에 남는다.
  return out.sort(
    (a, b) => rankLabel(a.label) - rankLabel(b.label) || a.name.localeCompare(b.name, 'ko')
  );
}

/** 팀의 {{팀장단}} 문구를 DB 에서 구성한다(자동 + 수동, 중복 제거). 없으면 빈 문자열. */
export async function composeTeamLeaders(db: Db, teamId: string): Promise<string> {
  const [memberRows, [team]] = await Promise.all([
    db
      .select({ label: teamMembers.label, name: users.name, phone: users.phone })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.position, 'leader'))),
    db.select({ leaders: teams.leaders }).from(teams).where(eq(teams.id, teamId)).limit(1),
  ]);
  const members: TeamLeader[] = memberRows.map((r) => ({
    label: r.label ?? '',
    name: r.name ?? '',
    phone: r.phone ?? '',
  }));
  const extras: TeamLeader[] = team?.leaders ?? [];
  return leadersBlock(mergeLeaders(members, extras));
}
