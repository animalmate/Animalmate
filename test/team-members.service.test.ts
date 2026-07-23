import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { teams, teamMembers, users, memberships, auditLogs } from '@/db/schema';
import { addTeamMemberByEmail, removeTeamMember, listTeamMembers, TeamMemberError } from '@/org/team-members';
import { PermissionError } from '@/auth/guard';
import type { Actor } from '@/auth/permissions';

const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const suite = DIRECT_URL ? describe : describe.skip;

const EMAIL = 'team-leader-test@example.invalid';
const BOARD_EMAIL = 'team-leader-test-board@example.invalid';
const TEAM_A = 'TM-TEST-A팀';
const TEAM_B = 'TM-TEST-B팀';

suite('팀 담당자(팀장) 배정 — 이메일 지정 + 역할 승격/강등', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let board: Actor;
  let staffNonBoard: Actor;
  let userId: string;
  let teamAId: string;
  let teamBId: string;

  async function cleanup() {
    const us = await db.select({ id: users.id }).from(users).where(inArray(users.email, [EMAIL, BOARD_EMAIL]));
    for (const u of us) {
      await db.delete(auditLogs).where(inArray(auditLogs.targetId, [u.id]));
      await db.delete(auditLogs).where(eq(auditLogs.actorUserId, u.id));
      await db.delete(memberships).where(eq(memberships.userId, u.id));
      await db.delete(users).where(eq(users.id, u.id));
    }
    const ts = await db.select({ id: teams.id }).from(teams).where(inArray(teams.name, [TEAM_A, TEAM_B]));
    for (const t of ts) {
      await db.delete(auditLogs).where(eq(auditLogs.targetId, t.id));
      await db.delete(teams).where(eq(teams.id, t.id)); // team_members cascade
    }
  }

  async function activeRole(): Promise<string[]> {
    const rows = await db
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active')));
    return rows.map((r) => r.role);
  }

  beforeAll(async () => {
    sql = postgres(DIRECT_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup();
    const [a] = await db.insert(teams).values({ name: TEAM_A, kind: 'activity' }).returning();
    const [b] = await db.insert(teams).values({ name: TEAM_B, kind: 'activity' }).returning();
    teamAId = a!.id;
    teamBId = b!.id;
    const [u] = await db.insert(users).values({ email: EMAIL, name: '테스트팀장' }).returning();
    userId = u!.id;
    await db.insert(memberships).values({ userId, role: 'member', termStart: '2026-01-01', termEnd: '2030-01-01', status: 'active' });
    // 감사 로그 actor_user_id 는 users FK — 실제 회장단 사용자를 만들어 사용.
    const [bu] = await db.insert(users).values({ email: BOARD_EMAIL, name: '테스트회장단' }).returning();
    await db.insert(memberships).values({ userId: bu!.id, role: 'board', termStart: '2026-01-01', termEnd: '2030-01-01', status: 'active' });
    board = { userId: bu!.id, role: 'sysadmin', membershipActive: true, teams: [] };
    staffNonBoard = { userId: bu!.id, role: 'staff', membershipActive: true, teams: [] };
  });

  afterAll(async () => {
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  it('비회장단은 팀장 지정 불가(403)', async () => {
    await expect(addTeamMemberByEmail(db, staffNonBoard, teamAId, EMAIL)).rejects.toBeInstanceOf(PermissionError);
  });

  it('없는 이메일은 user_not_found', async () => {
    await expect(addTeamMemberByEmail(db, board, teamAId, 'nobody@example.invalid')).rejects.toBeInstanceOf(TeamMemberError);
  });

  it('이메일로 팀장 지정 → member 가 staff 로 승격 + team_members 생성', async () => {
    expect(await activeRole()).toContain('member');
    const m = await addTeamMemberByEmail(db, board, teamAId, EMAIL);
    expect(m.position).toBe('leader');
    expect(await activeRole()).toContain('staff');
    expect(await activeRole()).not.toContain('member');
    const members = await listTeamMembers(db, teamAId);
    expect(members.some((x) => x.userId === userId && x.position === 'leader')).toBe(true);
  });

  it('두 번째 팀에도 지정 가능(중복 아님)', async () => {
    await addTeamMemberByEmail(db, board, teamBId, EMAIL);
    expect((await listTeamMembers(db, teamBId)).length).toBe(1);
  });

  it('한 팀 해제해도 다른 팀 소속 남으면 staff 유지', async () => {
    await removeTeamMember(db, board, teamAId, userId);
    expect((await listTeamMembers(db, teamAId)).length).toBe(0);
    expect(await activeRole()).toContain('staff'); // teamB 소속 남음
  });

  it('마지막 팀까지 해제하면 staff → member 강등', async () => {
    await removeTeamMember(db, board, teamBId, userId);
    expect(await activeRole()).toContain('member');
    expect(await activeRole()).not.toContain('staff');
  });
});
