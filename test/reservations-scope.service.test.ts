import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { teams, users, boards, scheduledPosts } from '@/db/schema';
import { listReservations } from '@/publishing/reservations';
import type { Actor } from '@/auth/permissions';

const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const suite = DIRECT_URL ? describe : describe.skip;

const MENUID = 990071;
const EMAIL = 'resv-scope-test@example.invalid';
const TEAM_A = 'RS-TEST-A팀';
const TEAM_B = 'RS-TEST-B팀';

suite('예약 큐 스코프 — 팀장은 자기 팀+개인만, 회장단은 전체', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let teamAId: string;
  let teamBId: string;
  let userId: string;
  const postIds: string[] = [];

  async function cleanup() {
    if (postIds.length) await db.delete(scheduledPosts).where(inArray(scheduledPosts.id, postIds));
    await db.delete(scheduledPosts).where(eq(scheduledPosts.boardMenuid, MENUID));
    await db.delete(boards).where(eq(boards.menuid, MENUID));
    await db.delete(users).where(eq(users.email, EMAIL));
    const ts = await db.select({ id: teams.id }).from(teams).where(inArray(teams.name, [TEAM_A, TEAM_B]));
    for (const t of ts) await db.delete(teams).where(eq(teams.id, t.id));
  }

  beforeAll(async () => {
    sql = postgres(DIRECT_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup();
    const [a] = await db.insert(teams).values({ name: TEAM_A, kind: 'activity' }).returning();
    const [b] = await db.insert(teams).values({ name: TEAM_B, kind: 'activity' }).returning();
    teamAId = a!.id;
    teamBId = b!.id;
    const [u] = await db.insert(users).values({ email: EMAIL, name: '스코프' }).returning();
    userId = u!.id;
    await db.insert(boards).values({ menuid: MENUID, name: '스코프 테스트', botCanWrite: true });

    const seed = async (ownerType: 'team' | 'personal', ownerId: string, title: string) => {
      const [p] = await db
        .insert(scheduledPosts)
        .values({ ownerType, ownerId, authorUserId: userId, boardMenuid: MENUID, title, contentMd: '내용', status: 'draft' })
        .returning();
      postIds.push(p!.id);
      return p!.id;
    };
    await seed('team', teamAId, 'A팀 예약');
    await seed('personal', userId, '내 개인 예약');
    await seed('team', teamBId, 'B팀 예약');
  });

  afterAll(async () => {
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  const titles = (rows: { title: string }[]) => rows.map((r) => r.title).sort();

  it('팀A 팀장(개인=본인): A팀 예약 + 내 개인 예약만', async () => {
    const actor: Actor = { userId, role: 'staff', membershipActive: true, teams: [{ teamId: teamAId, position: 'leader' }] };
    const rows = (await listReservations(db, { actor })).filter((r) => r.boardMenuid === MENUID);
    expect(titles(rows)).toEqual(['A팀 예약', '내 개인 예약']);
  });

  it('팀B 팀장(다른 사용자): B팀 예약만(개인·A팀 안 보임)', async () => {
    const actor: Actor = { userId: crypto.randomUUID(), role: 'staff', membershipActive: true, teams: [{ teamId: teamBId, position: 'leader' }] };
    const rows = (await listReservations(db, { actor })).filter((r) => r.boardMenuid === MENUID);
    expect(titles(rows)).toEqual(['B팀 예약']);
  });

  it('회장단: 전체', async () => {
    const actor: Actor = { userId: crypto.randomUUID(), role: 'board', membershipActive: true, teams: [] };
    const rows = (await listReservations(db, { actor })).filter((r) => r.boardMenuid === MENUID);
    expect(titles(rows)).toEqual(['A팀 예약', 'B팀 예약', '내 개인 예약']);
  });
});
