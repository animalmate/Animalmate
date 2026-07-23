import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { teams, users, boards, scheduledPosts, events, auditLogs } from '@/db/schema';
import { createReservation } from '@/publishing/reservations';
import { PermissionError } from '@/auth/guard';
import type { Actor } from '@/auth/permissions';

const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const suite = DIRECT_URL ? describe : describe.skip;

const MENUID = 990082;
const EMAIL = 'resv-create-test@example.invalid';
const TEAM_A = 'RC-TEST-A팀';
const TEAM_B = 'RC-TEST-B팀';

suite('봉사(팀) 예약 생성 권한 — 팀장은 자기 팀만, 회장단은 전 팀', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let teamAId: string;
  let teamBId: string;
  let userId: string;
  const createdPosts: string[] = [];

  async function cleanup() {
    await db.delete(scheduledPosts).where(eq(scheduledPosts.boardMenuid, MENUID));
    const evs = await db.select({ id: events.id }).from(events).where(inArray(events.teamId, [teamAId, teamBId].filter(Boolean) as string[]));
    for (const e of evs) await db.delete(events).where(eq(events.id, e.id));
    await db.delete(boards).where(eq(boards.menuid, MENUID));
    await db.delete(users).where(eq(users.email, EMAIL));
    const ts = await db.select({ id: teams.id }).from(teams).where(inArray(teams.name, [TEAM_A, TEAM_B]));
    for (const t of ts) await db.delete(teams).where(eq(teams.id, t.id));
  }

  beforeAll(async () => {
    sql = postgres(DIRECT_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    // 이전 크래시 잔여 데이터 방지(멱등).
    await db.delete(scheduledPosts).where(eq(scheduledPosts.boardMenuid, MENUID));
    await db.delete(boards).where(eq(boards.menuid, MENUID));
    await db.delete(users).where(eq(users.email, EMAIL));
    const oldTeams = await db.select({ id: teams.id }).from(teams).where(inArray(teams.name, [TEAM_A, TEAM_B]));
    for (const t of oldTeams) await db.delete(teams).where(eq(teams.id, t.id));
    const [a] = await db.insert(teams).values({ name: TEAM_A, kind: 'activity' }).returning();
    const [b] = await db.insert(teams).values({ name: TEAM_B, kind: 'activity' }).returning();
    teamAId = a!.id;
    teamBId = b!.id;
    const [u] = await db.insert(users).values({ email: EMAIL, name: '생성테스트' }).returning();
    userId = u!.id;
    await db.insert(boards).values({ menuid: MENUID, name: '생성 테스트', botCanWrite: true });
  });

  afterAll(async () => {
    if (createdPosts.length) await db.delete(auditLogs).where(inArray(auditLogs.targetId, createdPosts));
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  const leaderOfA: () => Actor = () => ({ userId, role: 'staff', membershipActive: true, teams: [{ teamId: teamAId, position: 'leader' }] });
  const board: () => Actor = () => ({ userId, role: 'board', membershipActive: true, teams: [] });
  const vol = (teamId: string) => ({ kind: 'volunteer' as const, teamId, boardMenuid: MENUID, title: '봉사', contentMd: '내용' });

  it('팀A 팀장: 팀A 예약 생성 성공', async () => {
    const post = await createReservation(db, leaderOfA(), vol(teamAId));
    createdPosts.push(post.id);
    expect(post.ownerType).toBe('team');
    expect(post.ownerId).toBe(teamAId);
  });

  it('팀A 팀장: 팀B 예약 생성 거부(not_owner)', async () => {
    await expect(createReservation(db, leaderOfA(), vol(teamBId))).rejects.toBeInstanceOf(PermissionError);
  });

  it('회장단: 팀B 예약도 생성 성공(override)', async () => {
    const post = await createReservation(db, board(), vol(teamBId));
    createdPosts.push(post.id);
    expect(post.ownerId).toBe(teamBId);
  });

  it('소속 팀 없는 운영진: 봉사 예약 생성 거부', async () => {
    const staffNoTeam: Actor = { userId, role: 'staff', membershipActive: true, teams: [] };
    await expect(createReservation(db, staffNoTeam, vol(teamAId))).rejects.toBeInstanceOf(PermissionError);
  });
});
