// 팀 소속(team_members)과 팀별 미가입자 팀장단(teams.leaders)을 관리한다. 회장단·시스템관리자 전용.
//
// 모델(2026-07-25 개편):
//  - 팀 소속·직함은 "회원 관리"에서 회원별로 배정(setUserTeams). position=leader 면 공지 {{팀장단}}에 노출.
//  - 팀장단 이름·전화는 users(가입 시 입력·본인 수정)에서 온다 — 팀별로 다시 적지 않는다.
//  - 앱 미가입자만 팀별 "수동 팀장단"(teams.leaders: 이름·전화)으로 공지에 덧붙인다(setTeamManualLeaders).
//  - 팀에 배정되면 member→staff 승격, 마지막 팀에서 빠지면 staff→member 강등(board/sysadmin 유지).

import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@/db/schema';
import { teamMembers, teams, users, memberships, type TeamLeader } from '@/db/schema';
import { isPrivileged, type Actor } from '@/auth/permissions';
import { PermissionError } from '@/auth/guard';
import { buildAuditEntry, recordAudit } from '@/auth/audit';
import { LIMITS, checkLength } from '@/http/input';

type Db = PostgresJsDatabase<typeof schema>;
export type Team = typeof teams.$inferSelect;

export type TeamPosition = 'leader' | 'member';

/** 회원 관리에서 지정하는 한 회원의 팀 배정. */
export interface UserTeamAssignment {
  teamId: string;
  position: TeamPosition; // leader = 팀장단(공지 노출) / member = 관리만
  label?: string; // 직함(팀장/부팀장 등). leader 일 때만 의미.
}

/** 팀별 미가입자 수동 팀장단(공지 표시용, 계정 없음). */
export interface ManualLeader {
  label: string;
  name: string;
  phone: string;
}

/** 한 팀의 수동 명단 최대 행 수. */
export const MAX_ROSTER_ENTRIES = 30;

export class TeamMemberError extends Error {
  readonly status = 400;
  constructor(
    readonly code: 'team_not_found' | 'user_not_found' | 'too_many_entries',
    readonly email?: string
  ) {
    super(code);
    this.name = 'TeamMemberError';
  }
}

function ensureBoard(actor: Actor): void {
  if (!isPrivileged(actor.role)) throw new PermissionError('role_insufficient');
}

// member 뿐이면 staff 로 승격(팀 소속 = 운영진). staff/board/sysadmin 은 유지.
async function promoteIfMember(tx: Db, userId: string, actorUserId: string): Promise<void> {
  const active = await tx
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active')));
  if (active.length > 0 && active.every((m) => m.role === 'member')) {
    await tx
      .update(memberships)
      .set({ role: 'staff' })
      .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active'), eq(memberships.role, 'member')));
    await recordAudit(tx, buildAuditEntry({ actorUserId, action: 'membership.promote', targetTable: 'memberships', targetId: userId, after: { role: 'staff', reason: 'team_assigned' } }));
  }
}

// 남은 팀 소속이 없고 staff 면 member 로 강등(board/sysadmin 유지).
async function demoteIfOrphan(tx: Db, userId: string, actorUserId: string): Promise<void> {
  const remaining = await tx.select({ teamId: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, userId));
  if (remaining.length > 0) return;
  const demoted = await tx
    .update(memberships)
    .set({ role: 'member' })
    .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active'), eq(memberships.role, 'staff')))
    .returning({ id: memberships.id });
  if (demoted.length > 0) {
    await recordAudit(tx, buildAuditEntry({ actorUserId, action: 'membership.demote', targetTable: 'memberships', targetId: userId, after: { role: 'member', reason: 'team_unassigned' } }));
  }
}

/** 한 회원의 팀 소속 목록(팀 이름 포함). 회원 관리 표시용. */
export interface UserTeamRow {
  teamId: string;
  teamName: string;
  position: TeamPosition;
  label: string;
}

/**
 * 회원의 팀 배정을 원하는 상태로 맞춘다(회장단/시스템관리자 전용).
 * 추가/직함·직위 변경/해제를 diff 로 처리하고, 그에 따라 운영진 승격/강등을 반영한다.
 */
export async function setUserTeams(db: Db, actor: Actor, userId: string, assignments: UserTeamAssignment[]): Promise<void> {
  ensureBoard(actor);

  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new TeamMemberError('user_not_found');

  // 원하는 배정 정규화(팀 중복은 마지막 값으로).
  const desired = new Map<string, { position: TeamPosition; label: string }>();
  for (const a of assignments) {
    const teamId = String(a.teamId ?? '').trim();
    if (!teamId) continue;
    const position: TeamPosition = a.position === 'member' ? 'member' : 'leader';
    const label = position === 'leader' ? String(a.label ?? '').trim() : '';
    checkLength('직함', label, LIMITS.label);
    desired.set(teamId, { position, label });
  }

  // 존재하는 팀만 허용(없는 팀 id 는 조용히 무시하지 않고 막는다 — FK 오류 대신 명확한 에러).
  for (const teamId of desired.keys()) {
    const [t] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!t) throw new TeamMemberError('team_not_found');
  }

  await db.transaction(async (tx) => {
    const current = await tx
      .select({ teamId: teamMembers.teamId, position: teamMembers.position, label: teamMembers.label })
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId));
    const currentMap = new Map(current.map((c) => [c.teamId, c]));

    let added = false;
    for (const [teamId, { position, label }] of desired) {
      const cur = currentMap.get(teamId);
      if (!cur) {
        await tx.insert(teamMembers).values({ teamId, userId, position, label: label || null }).onConflictDoNothing();
        added = true;
      } else if (cur.position !== position || (cur.label ?? '') !== label) {
        await tx.update(teamMembers).set({ position, label: label || null }).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
      }
    }
    if (added) await promoteIfMember(tx, userId, actor.userId);

    for (const teamId of currentMap.keys()) {
      if (desired.has(teamId)) continue;
      await tx.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
    }
    // 삭제 후 남은 소속이 없으면 강등.
    await demoteIfOrphan(tx, userId, actor.userId);

    await recordAudit(tx, buildAuditEntry({ actorUserId: actor.userId, action: 'team.set_user_teams', targetTable: 'team_members', targetId: userId, after: { teams: [...desired.keys()], count: desired.size } }));
  });
}

/**
 * 팀별 미가입자 수동 팀장단 저장(회장단/시스템관리자 전용). teams.leaders(이름·전화)만 갱신.
 * 계정·권한과 무관 — 공지 {{팀장단}}에 자동 명단 뒤로 덧붙는 표시 항목이다.
 */
export async function setTeamManualLeaders(db: Db, actor: Actor, teamId: string, extras: ManualLeader[]): Promise<Team> {
  ensureBoard(actor);

  const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) throw new TeamMemberError('team_not_found');

  if (extras.length > MAX_ROSTER_ENTRIES) throw new TeamMemberError('too_many_entries');
  const clean: TeamLeader[] = extras
    .map((e) => ({ label: String(e.label ?? '').trim(), name: String(e.name ?? '').trim(), phone: String(e.phone ?? '').trim() }))
    .filter((e) => e.name || e.phone);
  for (const e of clean) {
    checkLength('직함', e.label, LIMITS.label);
    checkLength('이름', e.name, LIMITS.name);
    checkLength('전화번호', e.phone, LIMITS.phone);
  }

  const [row] = await db.update(teams).set({ leaders: clean }).where(eq(teams.id, teamId)).returning();
  if (!row) throw new TeamMemberError('team_not_found');
  await recordAudit(db, buildAuditEntry({ actorUserId: actor.userId, action: 'team.set_manual_leaders', targetTable: 'teams', targetId: teamId, after: { count: clean.length } }));
  return row;
}
