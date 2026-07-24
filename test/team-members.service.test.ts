import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { teams, teamMembers, users, memberships, auditLogs } from '@/db/schema';
import { setUserTeams, setTeamManualLeaders } from '@/org/team-members';
import { PermissionError } from '@/auth/guard';
import type { Actor } from '@/auth/permissions';

const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const suite = DIRECT_URL ? describe : describe.skip;

const EMAIL = 'roster-test@example.invalid';
const BOARD_EMAIL = 'roster-test-board@example.invalid';
const TEAM_A = 'RT-TEST-A팀';
const TEAM_B = 'RT-TEST-B팀';

suite('팀 배정(setUserTeams) + 미가입자 팀장단(setTeamManualLeaders)', () => {
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
  const memberRow = async (teamId: string) =>
    (await db.select({ position: teamMembers.position, label: teamMembers.label }).from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId))))[0];

  beforeAll(async () => {
    sql = postgres(DIRECT_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup();
    const [a] = await db.insert(teams).values({ name: TEAM_A, kind: 'activity' }).returning();
    const [b] = await db.insert(teams).values({ name: TEAM_B, kind: 'activity' }).returning();
    teamAId = a!.id;
    teamBId = b!.id;
    const [u] = await db.insert(users).values({ email: EMAIL, name: '테스트팀장', phone: '010-1111-2222' }).returning();
    userId = u!.id;
    await db.insert(memberships).values({ userId, role: 'member', termStart: '2026-01-01', termEnd: '2030-01-01', status: 'active' });
    const [bu] = await db.insert(users).values({ email: BOARD_EMAIL, name: '테스트회장단' }).returning();
    await db.insert(memberships).values({ userId: bu!.id, role: 'board', termStart: '2026-01-01', termEnd: '2030-01-01', status: 'active' });
    board = { userId: bu!.id, role: 'sysadmin', membershipActive: true, teams: [] };
    staffNonBoard = { userId: bu!.id, role: 'staff', membershipActive: true, teams: [] };
  });

  afterAll(async () => {
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  it('비회장단은 팀 배정 불가(403)', async () => {
    await expect(setUserTeams(db, staffNonBoard, userId, [{ teamId: teamAId, position: 'leader', label: '팀장' }])).rejects.toBeInstanceOf(PermissionError);
  });

  it('없는 팀 → team_not_found', async () => {
    await expect(setUserTeams(db, board, userId, [{ teamId: '00000000-0000-0000-0000-000000000000', position: 'leader' }])).rejects.toMatchObject({
      name: 'TeamMemberError',
      code: 'team_not_found',
    });
  });

  it('팀장단 배정 → team_members(position=leader,label) + member→staff 승격', async () => {
    expect(await activeRole()).toContain('member');
    await setUserTeams(db, board, userId, [{ teamId: teamAId, position: 'leader', label: '팀장' }]);
    expect(await memberRow(teamAId)).toMatchObject({ position: 'leader', label: '팀장' });
    expect(await activeRole()).toContain('staff');
    expect(await activeRole()).not.toContain('member');
  });

  it('직위 변경(팀장단→팀원)은 label 을 비운다', async () => {
    await setUserTeams(db, board, userId, [{ teamId: teamAId, position: 'member', label: '무시됨' }]);
    expect(await memberRow(teamAId)).toMatchObject({ position: 'member', label: null });
  });

  it('두 팀 배정 후 A 빼면 staff 유지, 둘 다 빼면 member 강등', async () => {
    await setUserTeams(db, board, userId, [
      { teamId: teamAId, position: 'member' },
      { teamId: teamBId, position: 'leader', label: '부팀장' },
    ]);
    expect(await memberRow(teamBId)).toMatchObject({ position: 'leader', label: '부팀장' });

    await setUserTeams(db, board, userId, [{ teamId: teamBId, position: 'leader', label: '부팀장' }]); // A 제거
    expect(await memberRow(teamAId)).toBeUndefined();
    expect(await activeRole()).toContain('staff');

    await setUserTeams(db, board, userId, []); // 전부 제거
    expect(await memberRow(teamBId)).toBeUndefined();
    expect(await activeRole()).toContain('member');
    expect(await activeRole()).not.toContain('staff');
  });

  it('미가입자 팀장단은 teams.leaders 에만 저장(권한·소속 영향 없음)', async () => {
    await setTeamManualLeaders(db, board, teamAId, [{ label: '부팀장', name: '홍길동', phone: '010-9999-0000' }]);
    const [t] = await db.select({ leaders: teams.leaders }).from(teams).where(eq(teams.id, teamAId));
    expect(t!.leaders).toEqual([{ label: '부팀장', name: '홍길동', phone: '010-9999-0000' }]);
    expect(await memberRow(teamAId)).toBeUndefined(); // 소속에는 영향 없음
  });
});
