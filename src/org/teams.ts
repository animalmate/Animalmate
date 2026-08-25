// 팀(조직) 관리 — 회장단 전용. 생성/활성토글/삭제 + audit.
// 삭제는 참조(회차·프리셋·예약)가 있으면 막고 비활성화를 유도(데이터 무결성 — scheduled_posts 는 FK 없음).

import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from '@/db/types';
import { teams, events, scheduledPosts } from '@/db/schema';
import { isPrivileged, type Actor } from '@/auth/permissions';
import { PermissionError } from '@/auth/guard';
import { buildAuditEntry, recordAudit } from '@/auth/audit';

export type Team = typeof teams.$inferSelect;
export type TeamKind = 'activity' | 'functional';

function ensureBoard(actor: Actor): void {
  if (!isPrivileged(actor.role)) throw new PermissionError('role_insufficient');
}

export async function listAllTeams(db: Db): Promise<Team[]> {
  return db.select().from(teams).orderBy(asc(teams.name));
}

export async function createTeam(db: Db, actor: Actor, input: { name: string; kind: TeamKind }): Promise<Team> {
  ensureBoard(actor);
  const [row] = await db.insert(teams).values({ name: input.name, kind: input.kind, isActive: true }).returning();
  await recordAudit(db, buildAuditEntry({ actorUserId: actor.userId, action: 'team.create', targetTable: 'teams', targetId: row!.id, after: row }));
  return row!;
}

export async function setTeamActive(db: Db, actor: Actor, id: string, isActive: boolean): Promise<Team> {
  ensureBoard(actor);
  const [row] = await db.update(teams).set({ isActive }).where(eq(teams.id, id)).returning();
  if (!row) throw new Error('team not found');
  await recordAudit(db, buildAuditEntry({ actorUserId: actor.userId, action: isActive ? 'team.activate' : 'team.deactivate', targetTable: 'teams', targetId: id, after: { isActive } }));
  return row;
}
/**
 * 모집 공고 편집 권한 토글(`teams.can_edit_notice`, 0032) — 회장단만.
 *
 * 이 플래그 하나가 그 팀 소속 운영진 전원에게 신입 모집 0번 화면(공고 본문·포스터·지원서 문항·
 * 기수 생성/삭제)을 연다. 팀 **이름**이 아니라 플래그로 두는 이유는 07-DECISIONS 66/140 참고 —
 * 이름은 매 학기 바뀌고, 이름으로 판단하면 팀명 한 번 고칠 때 권한이 조용히 사라진다.
 *
 * 권한 경계가 움직이는 일이라 항상 audit 에 남긴다(규칙 #4).
 */
export async function setTeamNoticeEditing(db: Db, actor: Actor, id: string, canEditNotice: boolean): Promise<Team> {
  ensureBoard(actor);
  const [before] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
  if (!before) throw new Error('team not found');
  const [row] = await db.update(teams).set({ canEditNotice }).where(eq(teams.id, id)).returning();
  await recordAudit(
    db,
    buildAuditEntry({
      actorUserId: actor.userId,
      action: canEditNotice ? 'team.noticeEditing.grant' : 'team.noticeEditing.revoke',
      targetTable: 'teams',
      targetId: id,
      before: { canEditNotice: before.canEditNotice },
      after: { canEditNotice },
      severity: 'high',
    })
  );
  return row!;
}

// 팀 소속·직함 배정은 org/team-members.ts 의 setUserTeams(회원별), 미가입자 팀장단은 setTeamManualLeaders 로.

export class TeamInUseError extends Error {
  readonly status = 409;
  constructor(readonly counts: { events: number; reservations: number }) {
    super('team in use');
    this.name = 'TeamInUseError';
  }
}

/** 하드 삭제 — 참조가 없을 때만. 있으면 TeamInUseError(비활성화 권장). */
export async function deleteTeam(db: Db, actor: Actor, id: string): Promise<void> {
  ensureBoard(actor);
  const [[ev], [rv]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(events).where(eq(events.teamId, id)),
    db.select({ n: sql<number>`count(*)::int` }).from(scheduledPosts).where(and(eq(scheduledPosts.ownerType, 'team'), eq(scheduledPosts.ownerId, id))),
  ]);
  const counts = { events: ev?.n ?? 0, reservations: rv?.n ?? 0 };
  if (counts.events + counts.reservations > 0) throw new TeamInUseError(counts);
  await db.delete(teams).where(eq(teams.id, id)); // team_members 는 cascade
  await recordAudit(db, buildAuditEntry({ actorUserId: actor.userId, action: 'team.delete', targetTable: 'teams', targetId: id }));
}
