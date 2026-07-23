// 팀(조직) 관리 — 회장단 전용. 생성/활성토글/삭제 + audit.
// 삭제는 참조(회차·프리셋·예약)가 있으면 막고 비활성화를 유도(데이터 무결성 — scheduled_posts 는 FK 없음).

import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from '@/db/types';
import { teams, events, recurringRules, scheduledPosts, type TeamLeader } from '@/db/schema';
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

/** 팀장단 명단 교체(매 학기 갱신). 회장단 전용. audit(개인정보 값은 남기지 않고 인원수만). */
export async function setTeamLeaders(db: Db, actor: Actor, id: string, leaders: TeamLeader[]): Promise<Team> {
  ensureBoard(actor);
  const clean = leaders
    .map((l) => ({ label: String(l.label ?? '').trim(), name: String(l.name ?? '').trim(), phone: String(l.phone ?? '').trim() }))
    .filter((l) => l.name || l.phone);
  const [row] = await db.update(teams).set({ leaders: clean }).where(eq(teams.id, id)).returning();
  if (!row) throw new Error('team not found');
  await recordAudit(db, buildAuditEntry({ actorUserId: actor.userId, action: 'team.set_leaders', targetTable: 'teams', targetId: id, after: { count: clean.length } }));
  return row;
}

export class TeamInUseError extends Error {
  readonly status = 409;
  constructor(readonly counts: { events: number; presets: number; reservations: number }) {
    super('team in use');
    this.name = 'TeamInUseError';
  }
}

/** 하드 삭제 — 참조가 없을 때만. 있으면 TeamInUseError(비활성화 권장). */
export async function deleteTeam(db: Db, actor: Actor, id: string): Promise<void> {
  ensureBoard(actor);
  const [[ev], [pr], [rv]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(events).where(eq(events.teamId, id)),
    db.select({ n: sql<number>`count(*)::int` }).from(recurringRules).where(eq(recurringRules.teamId, id)),
    db.select({ n: sql<number>`count(*)::int` }).from(scheduledPosts).where(and(eq(scheduledPosts.ownerType, 'team'), eq(scheduledPosts.ownerId, id))),
  ]);
  const counts = { events: ev?.n ?? 0, presets: pr?.n ?? 0, reservations: rv?.n ?? 0 };
  if (counts.events + counts.presets + counts.reservations > 0) throw new TeamInUseError(counts);
  await db.delete(teams).where(eq(teams.id, id)); // team_members 는 cascade
  await recordAudit(db, buildAuditEntry({ actorUserId: actor.userId, action: 'team.delete', targetTable: 'teams', targetId: id }));
}
