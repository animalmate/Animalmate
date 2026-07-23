import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { recurringRules, boards, users, teams, auditLogs } from '@/db/schema';
import { createRule, updateRule, listActiveRules, getRule } from '@/recurrence/recurring-rules';
import { PermissionError } from '@/auth/guard';
import type { Actor } from '@/auth/permissions';

const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const suite = DIRECT_URL ? describe : describe.skip;

const MENUID = 990071;
const EMAIL = 'preset-test@example.invalid';
const TEAM_NAME = '프리셋테스트팀_zzz';

suite('recurring_rules(생성 프리셋) — CRUD (새 필드)', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let leader: Actor;
  let member: Actor;
  let teamId: string;
  const ruleIds: string[] = [];

  async function clearFixtures() {
    await db.delete(teams).where(eq(teams.name, TEAM_NAME)); // cascade rules
    await db.delete(boards).where(eq(boards.menuid, MENUID));
    await db.delete(users).where(eq(users.email, EMAIL));
  }

  beforeAll(async () => {
    sql = postgres(DIRECT_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await clearFixtures();
    const [t] = await db.insert(teams).values({ name: TEAM_NAME, kind: 'activity' }).returning();
    teamId = t!.id;
    await db.insert(boards).values({ menuid: MENUID, name: '프리셋 게시판', botCanWrite: true });
    const [u] = await db.insert(users).values({ email: EMAIL, name: '팀장' }).returning();
    leader = { userId: u!.id, role: 'staff', membershipActive: true, teams: [{ teamId, position: 'leader' }] };
    member = { userId: u!.id, role: 'member', membershipActive: true, teams: [{ teamId, position: 'member' }] };
  });

  afterAll(async () => {
    if (ruleIds.length) await db.delete(auditLogs).where(inArray(auditLogs.targetId, ruleIds));
    await clearFixtures();
    await sql.end({ timeout: 5 });
  });

  function input() {
    return {
      teamId,
      label: '정기 봉사',
      monthWeek: '1' as const,
      weekday: 0 as const,
      time: '14:00',
      boardMenuid: MENUID,
      templateId: null,
      // noticeLeadDays/publishTime 미지정 → 기본 7 / 20:00
    };
  }

  it('부원은 프리셋 생성 불가(PermissionError)', async () => {
    await expect(createRule(db, member, input())).rejects.toBeInstanceOf(PermissionError);
  });

  it('팀장단 프리셋 생성 — 기본값(notice_lead_days=7, publish_time=20:00) + audit', async () => {
    const rule = await createRule(db, leader, input());
    ruleIds.push(rule.id);
    expect(rule).toMatchObject({ teamId, monthWeek: '1', weekday: 0, noticeLeadDays: 7 });
    expect(rule.publishTime.startsWith('20:00')).toBe(true);
    expect(rule.templateId).toBeNull();
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.targetId, rule.id));
    expect(audits.some((a) => a.action === 'recurring.create')).toBe(true);
  });

  it('수정: notice_lead_days 변경', async () => {
    const rule = await createRule(db, leader, input());
    ruleIds.push(rule.id);
    const updated = await updateRule(db, leader, rule.id, { noticeLeadDays: 10 });
    expect(updated.noticeLeadDays).toBe(10);
  });

  it('listActiveRules 포함', async () => {
    const active = await listActiveRules(db);
    expect(active.some((r) => r.teamId === teamId)).toBe(true);
  });
});
