import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, gte, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { recurringRules, events, boards, users, teams, auditLogs } from '@/db/schema';
import { createRule, listActiveRules } from '@/recurrence/recurring-rules';
import { generateDueDrafts } from '@/recurrence/draft-generation';
import { PermissionError } from '@/auth/guard';
import type { Actor } from '@/auth/permissions';

const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const suite = DIRECT_URL ? describe : describe.skip;

const MENUID = 990071;
const EMAIL = 'recurring-test@example.invalid';
const TEAM_NAME = '반복테스트팀_zzz';

suite('recurring_rules — CRUD + 초안 생성', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let leader: Actor;
  let member: Actor;
  let teamId: string;
  const ruleIds: string[] = [];
  const eventIds: string[] = [];
  let testStart: Date;

  // teams 삭제는 events/recurring_rules 를 cascade 로 함께 제거한다(FK onDelete cascade).
  async function clearFixtures() {
    await db.delete(teams).where(eq(teams.name, TEAM_NAME));
    await db.delete(boards).where(eq(boards.menuid, MENUID));
    await db.delete(users).where(eq(users.email, EMAIL));
  }

  beforeAll(async () => {
    sql = postgres(DIRECT_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    testStart = new Date();
    await clearFixtures(); // 이전 실패 잔여 제거
    const [t] = await db.insert(teams).values({ name: TEAM_NAME, kind: 'activity' }).returning();
    teamId = t!.id;
    await db.insert(boards).values({ menuid: MENUID, name: '반복 게시판', botCanWrite: true });
    const [u] = await db.insert(users).values({ email: EMAIL, name: '팀장' }).returning();
    leader = { userId: u!.id, role: 'staff', membershipActive: true, teams: [{ teamId, position: 'leader' }] };
    member = { userId: u!.id, role: 'member', membershipActive: true, teams: [{ teamId, position: 'member' }] };
  });

  afterAll(async () => {
    const ids = [...ruleIds, ...eventIds];
    if (ids.length) await db.delete(auditLogs).where(inArray(auditLogs.targetId, ids));
    await db
      .delete(auditLogs)
      .where(and(eq(auditLogs.action, 'cron.draft_generate'), gte(auditLogs.createdAt, testStart)));
    await clearFixtures();
    await sql.end({ timeout: 5 });
  });

  function ruleInput() {
    return {
      teamId,
      label: '정기 봉사',
      monthWeek: '1' as const,
      weekday: 0 as const, // 일요일
      time: '14:00',
      boardMenuid: MENUID,
      templateMd: '## 봉사 공지\n일시: ...',
      draftLeadDays: 3,
    };
  }

  it('부원은 반복 규칙 생성 불가(PermissionError)', async () => {
    await expect(createRule(db, member, ruleInput())).rejects.toBeInstanceOf(PermissionError);
  });

  it('팀장단은 반복 규칙 생성 + audit', async () => {
    const rule = await createRule(db, leader, ruleInput());
    ruleIds.push(rule.id);
    expect(rule).toMatchObject({ teamId, monthWeek: '1', weekday: 0, draftLeadDays: 3, isActive: true });
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.targetId, rule.id));
    expect(audits.some((a) => a.action === 'recurring.create')).toBe(true);
  });

  it('D-3 에 회차 초안 생성(멱등 — 재실행해도 중복 없음)', async () => {
    // 첫째 일요일 = 2026-02-01, D-3 = 2026-01-29
    const now = new Date(Date.UTC(2026, 0, 29));
    const s1 = await generateDueDrafts(db, now);
    expect(s1.created).toBeGreaterThanOrEqual(1);
    eventIds.push(...s1.eventIds);

    const evs = await db.select().from(events).where(eq(events.teamId, teamId));
    const target = evs.find((e) => e.eventDate === '2026-02-01');
    expect(target).toBeTruthy();
    expect(target!.status).toBe('draft');
    expect(target!.title).toBe('정기 봉사');

    // 재실행 → 같은 rule+date 중복 생성 안 함
    const s2 = await generateDueDrafts(db, now);
    const evs2 = await db
      .select()
      .from(events)
      .where(and(eq(events.teamId, teamId), eq(events.eventDate, '2026-02-01')));
    expect(evs2).toHaveLength(1);
    expect(s2.eventIds.includes(target!.id)).toBe(false);
  });

  it('D-3 이 아니면 생성 안 함', async () => {
    const notDue = new Date(Date.UTC(2026, 0, 15));
    const before = (await db.select().from(events).where(eq(events.teamId, teamId))).length;
    await generateDueDrafts(db, notDue);
    const after = (await db.select().from(events).where(eq(events.teamId, teamId))).length;
    expect(after).toBe(before);
  });

  it('listActiveRules 는 활성 규칙을 포함', async () => {
    const active = await listActiveRules(db);
    expect(active.some((r) => r.teamId === teamId)).toBe(true);
  });
});
