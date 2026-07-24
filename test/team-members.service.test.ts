import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { teams, teamMembers, users, memberships, auditLogs } from '@/db/schema';
import { setTeamRoster } from '@/org/team-members';
import { PermissionError } from '@/auth/guard';
import type { Actor } from '@/auth/permissions';

const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const suite = DIRECT_URL ? describe : describe.skip;

const EMAIL = 'roster-test@example.invalid';
const BOARD_EMAIL = 'roster-test-board@example.invalid';
const TEAM_A = 'RT-TEST-A팀';
const TEAM_B = 'RT-TEST-B팀';

suite('팀장단 명단 저장(setTeamRoster) — 공지 명단 + 관리 권한 동기화', () => {
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
  const leaderCount = async (teamId: string) => (await db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId))).length;

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
    const [bu] = await db.insert(users).values({ email: BOARD_EMAIL, name: '테스트회장단' }).returning();
    await db.insert(memberships).values({ userId: bu!.id, role: 'board', termStart: '2026-01-01', termEnd: '2030-01-01', status: 'active' });
    board = { userId: bu!.id, role: 'sysadmin', membershipActive: true, teams: [] };
    staffNonBoard = { userId: bu!.id, role: 'staff', membershipActive: true, teams: [] };
  });

  afterAll(async () => {
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  it('비회장단은 명단 저장 불가(403)', async () => {
    await expect(setTeamRoster(db, staffNonBoard, teamAId, [{ label: '팀장', name: 'x', phone: '', email: EMAIL }])).rejects.toBeInstanceOf(PermissionError);
  });

  it('없는 이메일 → user_not_found(+email)', async () => {
    await expect(setTeamRoster(db, board, teamAId, [{ label: '팀장', name: 'x', phone: '', email: 'nobody@example.invalid' }])).rejects.toMatchObject({
      name: 'TeamMemberError',
      code: 'user_not_found',
      email: 'nobody@example.invalid',
    });
  });

  it('이메일 포함 명단 저장 → JSONB 저장 + member→staff 승격 + team_members 생성', async () => {
    expect(await activeRole()).toContain('member');
    await setTeamRoster(db, board, teamAId, [{ label: '팀장', name: '', phone: '010-1', email: EMAIL }]);
    const [t] = await db.select({ leaders: teams.leaders }).from(teams).where(eq(teams.id, teamAId));
    expect(t!.leaders[0]).toMatchObject({ label: '팀장', name: '테스트팀장', phone: '010-1', email: EMAIL }); // 이름은 계정에서 채움
    expect(await activeRole()).toContain('staff');
    expect(await activeRole()).not.toContain('member');
    expect(await leaderCount(teamAId)).toBe(1);
  });

  it('이메일 없는 행은 공지용으로만 저장(권한 없음)', async () => {
    await setTeamRoster(db, board, teamAId, [
      { label: '팀장', name: '', phone: '010-1', email: EMAIL },
      { label: '부팀장', name: '홍길동', phone: '010-2' },
    ]);
    const [t] = await db.select({ leaders: teams.leaders }).from(teams).where(eq(teams.id, teamAId));
    expect(t!.leaders.length).toBe(2);
    expect(await leaderCount(teamAId)).toBe(1); // 권한은 이메일 있는 1명만
  });

  it('두 번째 팀에도 지정 후, 첫 팀에서 빼도 staff 유지 → 마지막까지 빼면 member 강등', async () => {
    await setTeamRoster(db, board, teamBId, [{ label: '팀장', name: '', phone: '', email: EMAIL }]);
    expect(await leaderCount(teamBId)).toBe(1);

    await setTeamRoster(db, board, teamAId, []); // A팀 명단 비움
    expect(await leaderCount(teamAId)).toBe(0);
    expect(await activeRole()).toContain('staff'); // B팀 소속 남음

    await setTeamRoster(db, board, teamBId, []); // B팀도 비움
    expect(await leaderCount(teamBId)).toBe(0);
    expect(await activeRole()).toContain('member');
    expect(await activeRole()).not.toContain('staff');
  });
});
