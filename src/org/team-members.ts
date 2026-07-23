// 팀장단 명단 저장 = 공지 연락처(teams.leaders JSONB) + 관리 권한(team_members) 동기화(회장단/시스템관리자 전용).
//
// 모델(2026-07-24 회장단 지시):
//  - 팀장단 = 팀장 + 부팀장. 명단 각 행: 직위/이름/전화(공지 표시) + 이메일(관리 권한 계정 연결).
//  - 이메일이 가입 계정과 연결되면 그 계정에 이 팀 예약·템플릿 관리 권한 부여(회장단/시스템관리자와 함께).
//  - 명단에 추가된 계정은 운영진(staff)으로 승격, 명단에서 빠지고 남은 팀 소속이 없으면 member 로 강등.

import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@/db/schema';
import { teamMembers, teams, users, memberships, type TeamLeader } from '@/db/schema';
import { isPrivileged, type Actor } from '@/auth/permissions';
import { PermissionError } from '@/auth/guard';
import { buildAuditEntry, recordAudit } from '@/auth/audit';

type Db = PostgresJsDatabase<typeof schema>;
export type Team = typeof teams.$inferSelect;

export interface RosterEntry {
  label: string;
  name: string;
  phone: string;
  email?: string;
}

export class TeamMemberError extends Error {
  readonly status = 400;
  constructor(
    readonly code: 'team_not_found' | 'user_not_found' | 'user_inactive',
    readonly email?: string
  ) {
    super(code);
    this.name = 'TeamMemberError';
  }
}

function ensureBoard(actor: Actor): void {
  if (!isPrivileged(actor.role)) throw new PermissionError('role_insufficient');
}

// member 뿐이면 staff 로 승격(팀장단은 운영진). staff/board/sysadmin 은 유지.
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
    await recordAudit(tx, buildAuditEntry({ actorUserId, action: 'membership.promote', targetTable: 'memberships', targetId: userId, after: { role: 'staff', reason: 'team_leader' } }));
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
    await recordAudit(tx, buildAuditEntry({ actorUserId, action: 'membership.demote', targetTable: 'memberships', targetId: userId, after: { role: 'member', reason: 'team_leader_removed' } }));
  }
}

/**
 * 팀장단 명단 저장(회장단/시스템관리자 전용).
 * teams.leaders(공지 표시: 직위/이름/전화/이메일) 저장 + 이메일이 연결된 계정을 team_members(관리 권한)로 동기화.
 * 이메일이 있는 행은 가입 완료 + 활성 멤버십이어야 한다(없으면 TeamMemberError).
 */
export async function setTeamRoster(db: Db, actor: Actor, teamId: string, entries: RosterEntry[]): Promise<Team> {
  ensureBoard(actor);

  const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) throw new TeamMemberError('team_not_found');

  const clean = entries
    .map((e) => ({
      label: String(e.label ?? '').trim(),
      name: String(e.name ?? '').trim(),
      phone: String(e.phone ?? '').trim(),
      email: String(e.email ?? '').trim().toLowerCase(),
    }))
    .filter((e) => e.name || e.phone || e.email);

  // 이메일이 있는 행 → 계정 확인(관리 권한 부여 대상).
  const resolved = new Map<string, { userId: string; name: string }>();
  for (const e of clean) {
    if (!e.email || resolved.has(e.email)) continue;
    const [u] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.email, e.email)).limit(1);
    if (!u) throw new TeamMemberError('user_not_found', e.email);
    const active = await db.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.userId, u.id), eq(memberships.status, 'active')));
    if (active.length === 0) throw new TeamMemberError('user_inactive', e.email);
    resolved.set(e.email, { userId: u.id, name: u.name });
  }

  // JSONB 명단: 이름이 비면 계정 이름으로 채움(공지 표시).
  const leaders: TeamLeader[] = clean.map((e) => ({
    label: e.label,
    name: e.name || (e.email ? (resolved.get(e.email)?.name ?? '') : ''),
    phone: e.phone,
    ...(e.email ? { email: e.email } : {}),
  }));

  const desired = new Set([...resolved.values()].map((v) => v.userId));

  return db.transaction(async (tx) => {
    const [row] = await tx.update(teams).set({ leaders }).where(eq(teams.id, teamId)).returning();
    if (!row) throw new TeamMemberError('team_not_found');

    const current = await tx.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId));
    const currentSet = new Set(current.map((c) => c.userId));

    for (const userId of desired) {
      if (currentSet.has(userId)) continue;
      await promoteIfMember(tx, userId, actor.userId);
      await tx.insert(teamMembers).values({ teamId, userId, position: 'leader' }).onConflictDoNothing();
    }
    for (const userId of currentSet) {
      if (desired.has(userId)) continue;
      await tx.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
      await demoteIfOrphan(tx, userId, actor.userId);
    }

    await recordAudit(tx, buildAuditEntry({ actorUserId: actor.userId, action: 'team.set_roster', targetTable: 'teams', targetId: teamId, after: { count: leaders.length, managers: desired.size } }));
    return row;
  });
}
