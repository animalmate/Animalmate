// 챗봇 쿼터 — 인당 일일 상한 + 전역 분기 상한 + 킬스위치(결정 3). 실 DB(chat_logs 카운트).

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray, like } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { chatLogs, users, appSettings, auditLogs } from '@/db/schema';
import { checkQuota, getUsage, SETTING_KEYS } from '@/rag/quota';
import { setSettingSystem } from '@/rag/settings';
import type { Actor } from '@/auth/permissions';

const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const suite = DIRECT_URL ? describe : describe.skip;

const EMAIL = 'quota-test@example.invalid';
const KEYS = Object.values(SETTING_KEYS);
const NO_MAIL = { mailer: { send: async () => {}, sendOtp: async () => {} }, alertEmails: async () => ['ops@example.invalid'] };

suite('챗봇 쿼터', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let actor: Actor;

  async function seedLogs(n: number, userId: string | null, when: Date) {
    if (n <= 0) return;
    await db.insert(chatLogs).values(
      Array.from({ length: n }, () => ({ userId, roleAtTime: 'member' as const, question: 'q', answer: 'a', sources: [], handedOff: false, createdAt: when }))
    );
  }
  async function cleanup() {
    await db.delete(chatLogs).where(eq(chatLogs.question, 'q'));
    await db.delete(appSettings).where(inArray(appSettings.key, KEYS));
    await db.delete(auditLogs).where(inArray(auditLogs.targetId, KEYS));
    await db.delete(users).where(eq(users.email, EMAIL));
  }

  beforeAll(async () => {
    sql = postgres(DIRECT_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup();
    const [u] = await db.insert(users).values({ email: EMAIL, name: '쿼터' }).returning();
    actor = { userId: u!.id, role: 'member', membershipActive: true, teams: [] };
  });
  beforeEach(async () => {
    await db.delete(chatLogs).where(eq(chatLogs.question, 'q'));
    await db.delete(appSettings).where(inArray(appSettings.key, KEYS));
  });
  afterAll(async () => {
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  it('기본 한도 안이면 통과하고 남은 횟수를 알려준다', async () => {
    const r = await checkQuota(db, actor, { ...NO_MAIL });
    expect(r.allowed).toBe(true);
    expect(r.dailyRemaining).toBeGreaterThan(0);
  });

  it('인당 일일 한도를 낮게 두고 그만큼 쓰면 막힌다', async () => {
    await setSettingSystem(db, SETTING_KEYS.dailyPerUser, 3);
    await seedLogs(3, actor.userId, new Date());
    const r = await checkQuota(db, actor, { ...NO_MAIL });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('daily_user');
  });

  it('다른 사용자의 사용량은 내 일일 한도에 영향을 주지 않는다', async () => {
    await setSettingSystem(db, SETTING_KEYS.dailyPerUser, 3);
    await seedLogs(5, null, new Date()); // 익명/타인
    const r = await checkQuota(db, actor, { ...NO_MAIL });
    expect(r.allowed).toBe(true); // 내 카운트는 0
  });

  it('전역 분기 한도 도달 시 막고, 챗봇을 끄고, 회장단에 알린다(1회)', async () => {
    await setSettingSystem(db, SETTING_KEYS.globalQuarter, 2);
    await seedLogs(2, actor.userId, new Date());
    let alerts = 0;
    const r = await checkQuota(db, actor, { mailer: { send: async () => { alerts += 1; }, sendOtp: async () => {} }, alertEmails: async () => ['ops@example.invalid'] });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('global');
    expect(alerts).toBe(1);
    // 킬스위치가 내려갔다 → 이후엔 disabled 로 막히고 알림은 다시 안 간다.
    const r2 = await checkQuota(db, actor, { mailer: { send: async () => { alerts += 1; }, sendOtp: async () => {} }, alertEmails: async () => ['ops@example.invalid'] });
    expect(r2.reason).toBe('disabled');
    expect(alerts).toBe(1);
  });

  it('킬스위치(enabled=false)면 사용량과 무관하게 막힌다', async () => {
    await setSettingSystem(db, SETTING_KEYS.enabled, false);
    const r = await checkQuota(db, actor, { ...NO_MAIL });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('disabled');
  });

  it('getUsage 는 현재 사용량·상한·활성 상태를 돌려준다', async () => {
    await setSettingSystem(db, SETTING_KEYS.globalQuarter, 100);
    await seedLogs(4, actor.userId, new Date());
    const u = await getUsage(db);
    expect(u.globalQuarter).toBe(100);
    expect(u.globalUsedThisQuarter).toBeGreaterThanOrEqual(4);
    expect(typeof u.enabled).toBe('boolean');
  });
});
