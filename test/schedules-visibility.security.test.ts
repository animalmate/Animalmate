// 일정 visibility 강제 — 부원이 운영진·회장단 일정을 **어떤 경로로도** 못 보는지 증명한다.
//
// 실 DB 로 돌리는 이유: 이 필터는 SQL WHERE 에 있다. 순수 함수 테스트(src/auth/visibility.test.ts)는
// "무엇을 허용하는지"만 증명하고, 그 목록이 실제 쿼리에 걸렸는지는 증명하지 못한다.
// 챗봇 tool 경로(executeTool)까지 함께 태워, 모델이 부르는 길에서도 새지 않는 것을 본다.

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, like, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { schedules, users, auditLogs } from '@/db/schema';
import { createSchedule, listSchedules, getSchedule, updateSchedule, deleteSchedule } from '@/schedules/schedules';
import { executeTool } from '@/rag/tools';
import { PermissionError } from '@/auth/guard';
import type { Actor } from '@/auth/permissions';
import { TEST_DATABASE_URL } from './db-url';

const PREFIX = 'SCHEDTEST_';
const OWNER_EMAIL = 'schedtest-owner@example.invalid';

// 고정 날짜를 쓴다(오늘 기준으로 잡으면 달이 바뀔 때 테스트가 흔들린다).
const D1 = '2030-03-10';
const D2 = '2030-03-12';
const NOW = new Date('2030-03-01T00:00:00Z');

describe('일정 visibility — 조회자 역할 이하 등급만 보인다', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let owner: Actor; // board

  async function cleanup() {
    const rows = await db.select({ id: schedules.id }).from(schedules).where(like(schedules.title, `${PREFIX}%`));
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      await db.delete(auditLogs).where(inArray(auditLogs.targetId, ids));
      await db.delete(schedules).where(inArray(schedules.id, ids));
    }
    await db.delete(users).where(eq(users.email, OWNER_EMAIL));
  }

  beforeAll(async () => {
    sql = postgres(TEST_DATABASE_URL, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup();
    const [u] = await db.insert(users).values({ email: OWNER_EMAIL, name: '일정오너' }).returning();
    owner = { userId: u!.id, role: 'board', membershipActive: true, teams: [] };

    await createSchedule(db, owner, { title: `${PREFIX}전체총회`, startDate: D1, visibility: 'member', place: '학생회관' });
    await createSchedule(db, owner, { title: `${PREFIX}운영진회의`, startDate: D1, visibility: 'staff' });
    await createSchedule(db, owner, { title: `${PREFIX}회장단예산회의`, startDate: D1, visibility: 'board' });
    await createSchedule(db, owner, { title: `${PREFIX}MT`, startDate: D1, endDate: D2, visibility: 'member' });
  });

  afterAll(async () => {
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  const member: Actor = { userId: 'm', role: 'member', membershipActive: true, teams: [] };
  const staff: Actor = { userId: 's', role: 'staff', membershipActive: true, teams: [] };

  const titles = async (actor: Actor) =>
    (await listSchedules(db, actor, { from: D1, to: D2 })).map((s) => s.title).filter((t) => t.startsWith(PREFIX)).sort();

  it('부원은 부원 공개 일정만 본다', async () => {
    expect(await titles(member)).toEqual([`${PREFIX}MT`, `${PREFIX}전체총회`]);
  });

  it('운영진은 부원·운영진 일정까지 본다(회장단 일정은 안 보인다)', async () => {
    expect(await titles(staff)).toEqual([`${PREFIX}MT`, `${PREFIX}운영진회의`, `${PREFIX}전체총회`]);
  });

  it('회장단은 전부 본다', async () => {
    expect(await titles(owner)).toHaveLength(4);
  });

  it('단건 조회도 막힌다 — 못 보는 일정은 없는 것과 같다(존재 여부도 알려주지 않는다)', async () => {
    const [boardOnly] = await db.select().from(schedules).where(eq(schedules.title, `${PREFIX}회장단예산회의`));
    expect(await getSchedule(db, owner, boardOnly!.id)).not.toBeNull();
    expect(await getSchedule(db, staff, boardOnly!.id)).toBeNull();
    expect(await getSchedule(db, member, boardOnly!.id)).toBeNull();
  });

  it('챗봇 tool 경로에서도 같은 필터가 걸린다', async () => {
    const asMember = await executeTool(db, member, 'list_club_schedules', { from: D1, to: D2 }, NOW);
    const asStaff = await executeTool(db, staff, 'list_club_schedules', { from: D1, to: D2 }, NOW);
    const names = (r: Record<string, unknown>) =>
      (r.schedules as { title: string }[]).map((s) => s.title).filter((t) => t.startsWith(PREFIX));
    expect(names(asMember)).toEqual(expect.arrayContaining([`${PREFIX}전체총회`]));
    expect(names(asMember)).not.toContain(`${PREFIX}운영진회의`);
    expect(names(asStaff)).toContain(`${PREFIX}운영진회의`);
    expect(names(asStaff)).not.toContain(`${PREFIX}회장단예산회의`);
  });

  it('모델에게 주는 결과에는 visibility 가 들어가지 않는다', async () => {
    const r = await executeTool(db, staff, 'list_club_schedules', { from: D1, to: D2 }, NOW);
    for (const s of r.schedules as Record<string, unknown>[]) {
      expect(s).not.toHaveProperty('visibility');
      expect(s).toHaveProperty('weekday'); // 요일은 모델이 계산하지 않게 미리 준다
    }
  });

  it('여러 날 일정은 중간 날짜로 조회해도 걸린다', async () => {
    const mid = await listSchedules(db, member, { from: D2, to: D2 });
    expect(mid.map((s) => s.title)).toContain(`${PREFIX}MT`);
  });

  it('지난 일정은 기본 조회(from=오늘)에 걸리지 않는다', async () => {
    const past = await listSchedules(db, member, { from: '2030-03-11', to: '2030-03-11' });
    expect(past.map((s) => s.title)).not.toContain(`${PREFIX}전체총회`); // 3/10 하루짜리
    expect(past.map((s) => s.title)).toContain(`${PREFIX}MT`); // 3/10~3/12 는 걸친다
  });

  it('등록·수정·삭제는 회장단만 — 운영진은 거부된다', async () => {
    const [one] = await db.select().from(schedules).where(eq(schedules.title, `${PREFIX}전체총회`));
    const input = { title: `${PREFIX}전체총회`, startDate: D1, visibility: 'member' as const };
    await expect(createSchedule(db, staff, { ...input, title: `${PREFIX}몰래추가` })).rejects.toThrow(PermissionError);
    await expect(updateSchedule(db, staff, one!.id, input)).rejects.toThrow(PermissionError);
    await expect(deleteSchedule(db, staff, one!.id)).rejects.toThrow(PermissionError);
    // 거부된 뒤에도 원본이 그대로인지 확인한다(권한 검사가 쓰기보다 먼저인지).
    const after = await db.select().from(schedules).where(eq(schedules.id, one!.id));
    expect(after).toHaveLength(1);
  });
});
