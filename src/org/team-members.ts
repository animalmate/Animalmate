// 팀 담당자(팀장/팀원) 배정 — 회장단·시스템관리자 전용. 이메일로 지정한다.
// team_members 는 팀 소유 리소스(팀 템플릿·봉사 예약)의 권한 스코프와 미완성/실패 알림 수신자를 결정한다.
//
// 모델(2026-07-23 회장단 지시):
//  - 팀장 지정 = 운영진(staff) 임명 + 팀 배정(한 번의 감사 행위). member 역할이면 staff 로 승격.
//  - 팀장 해제 = 팀 배정 제거. 남은 팀 소속이 없고 staff 면 member 로 강등(board/sysadmin 은 유지).
//  - 회장단/시스템관리자는 전 팀을 관리(권한 우회 override). 팀장은 소속 팀만(ownsResource).

import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db/types';
import { teamMembers, teams, users, memberships } from '@/db/schema';
import { isPrivileged, type Actor } from '@/auth/permissions';
import { PermissionError } from '@/auth/guard';
import { buildAuditEntry, recordAudit } from '@/auth/audit';

export type TeamPosition = 'leader' | 'member';

export interface TeamMemberRow {
  userId: string;
  email: string;
  name: string;
  position: TeamPosition;
}

/** 회장단/시스템관리자만 팀 담당자를 추가·제거할 수 있다. */
function ensureBoard(actor: Actor): void {
  if (!isPrivileged(actor.role)) throw new PermissionError('role_insufficient');
}

export class TeamMemberError extends Error {
  readonly status = 400;
  constructor(readonly code: 'team_not_found' | 'user_not_found' | 'user_inactive') {
    super(code);
    this.name = 'TeamMemberError';
  }
}

/** 한 팀의 담당자 목록(이메일·이름·직위). */
export async function listTeamMembers(db: Db, teamId: string): Promise<TeamMemberRow[]> {
  const rows = await db
    .select({ userId: teamMembers.userId, email: users.email, name: users.name, position: teamMembers.position })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId));
  return rows.map((r) => ({ userId: r.userId, email: r.email, name: r.name, position: r.position as TeamPosition }));
}

/**
 * 이메일로 팀 담당자를 지정(회장단/시스템관리자 전용). 기본 leader(팀장).
 * 대상은 가입 완료 + 활성 멤버십이어야 한다. leader 지정 시 member 역할이면 staff 로 승격.
 */
export async function addTeamMemberByEmail(
  db: Db,
  actor: Actor,
  teamId: string,
  email: string,
  position: TeamPosition = 'leader'
): Promise<TeamMemberRow> {
  ensureBoard(actor);
  const normEmail = email.trim().toLowerCase();

  const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) throw new TeamMemberError('team_not_found');

  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.email, normEmail))
    .limit(1);
  if (!user) throw new TeamMemberError('user_not_found');

  const active = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, user.id), eq(memberships.status, 'active')));
  if (active.length === 0) throw new TeamMemberError('user_inactive');

  await db.transaction(async (tx) => {
    // 팀장은 운영진 — member 뿐이면 staff 로 승격(staff/board/sysadmin 은 그대로).
    if (position === 'leader' && active.every((m) => m.role === 'member')) {
      await tx
        .update(memberships)
        .set({ role: 'staff' })
        .where(and(eq(memberships.userId, user.id), eq(memberships.status, 'active'), eq(memberships.role, 'member')));
      await recordAudit(
        tx,
        buildAuditEntry({ actorUserId: actor.userId, action: 'membership.promote', targetTable: 'memberships', targetId: user.id, after: { role: 'staff', reason: 'team_leader' } })
      );
    }
    await tx
      .insert(teamMembers)
      .values({ teamId, userId: user.id, position })
      .onConflictDoUpdate({ target: [teamMembers.teamId, teamMembers.userId], set: { position } });
    await recordAudit(
      tx,
      buildAuditEntry({ actorUserId: actor.userId, action: 'team.add_member', targetTable: 'team_members', targetId: teamId, after: { userId: user.id, email: user.email, position } })
    );
  });

  return { userId: user.id, email: user.email, name: user.name, position };
}

/**
 * 팀 담당자 제거(회장단/시스템관리자 전용). 남은 팀 소속이 없고 staff 면 member 로 강등(board/sysadmin 유지).
 */
export async function removeTeamMember(db: Db, actor: Actor, teamId: string, userId: string): Promise<void> {
  ensureBoard(actor);
  await db.transaction(async (tx) => {
    await tx.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));

    const remaining = await tx.select({ teamId: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, userId));
    if (remaining.length === 0) {
      const demoted = await tx
        .update(memberships)
        .set({ role: 'member' })
        .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active'), eq(memberships.role, 'staff')))
        .returning({ id: memberships.id });
      if (demoted.length > 0) {
        await recordAudit(
          tx,
          buildAuditEntry({ actorUserId: actor.userId, action: 'membership.demote', targetTable: 'memberships', targetId: userId, after: { role: 'member', reason: 'team_leader_removed' } })
        );
      }
    }
    await recordAudit(
      tx,
      buildAuditEntry({ actorUserId: actor.userId, action: 'team.remove_member', targetTable: 'team_members', targetId: teamId, before: { userId } })
    );
  });
}
