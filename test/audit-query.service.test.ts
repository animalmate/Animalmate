import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray, like } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { users, auditLogs } from '@/db/schema';
import { listAuditActors, listAuditLogs } from '@/auth/audit-query';
import { TEST_DATABASE_URL } from './db-url';

const EMAILS = ['qa-audit-1@example.invalid', 'qa-audit-2@example.invalid'];
const TARGET = 'QA-AUDIT-대상';

/**
 * 감사 기록 조회 — 필터와 이어보기를 **실 DB** 에 대고 확인한다.
 *
 * 순수 함수(`audit-view.ts`)만으로는 못 잡는 것들이 있다: `like 'cron.%'` 로 자동 작업을 빼는
 * 조건, (시각, id) 순서쌍 커서, 탈퇴 계정 이름 감추기는 전부 SQL 층에서 벌어진다.
 */
describe('감사 기록 조회 (실 DB)', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let actorA: string;
  let actorB: string;

  async function cleanup() {
    await db.delete(auditLogs).where(like(auditLogs.targetId, `${TARGET}%`));
    await db.delete(users).where(inArray(users.email, EMAILS));
  }

  /** 같은 시각에 여러 건을 만들어 커서 경계를 실제로 밟게 한다. */
  const SAME_MOMENT = new Date('2026-08-28T03:00:00.000Z');

  beforeAll(async () => {
    sql = postgres(TEST_DATABASE_URL, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup();

    const created = await db
      .insert(users)
      .values([
        { email: EMAILS[0]!, name: 'QA감사A' },
        { email: EMAILS[1]!, name: 'QA감사B' },
      ])
      .returning();
    actorA = created[0]!.id;
    actorB = created[1]!.id;

    await db.insert(auditLogs).values([
      // 같은 시각 3건 — 커서가 (시각, id) 순서쌍이 아니면 여기서 빠지거나 겹친다.
      { actorUserId: actorA, action: 'document.update', targetTable: 'documents', targetId: `${TARGET}-1`, createdAt: SAME_MOMENT, afterJson: { title: '가' } },
      { actorUserId: actorA, action: 'document.delete', targetTable: 'documents', targetId: `${TARGET}-2`, createdAt: SAME_MOMENT },
      { actorUserId: actorB, action: 'membership.set_role [high]', targetTable: 'memberships', targetId: `${TARGET}-3`, createdAt: SAME_MOMENT, beforeJson: { role: 'staff' }, afterJson: { role: 'board' } },
      // 자동 작업 — 기본 목록에서 빠져야 한다.
      { actorUserId: null, action: 'cron.publish', targetTable: 'scheduled_posts', targetId: `${TARGET}-4`, createdAt: SAME_MOMENT },
      { actorUserId: null, action: 'batch.generate_draft', targetTable: 'scheduled_posts', targetId: `${TARGET}-5`, createdAt: SAME_MOMENT },
      // 기간 필터 확인용 — 아주 오래된 것.
      { actorUserId: actorB, action: 'board.create', targetTable: 'boards', targetId: `${TARGET}-6`, createdAt: new Date('2025-01-01T00:00:00.000Z') },
    ]);
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  /** 이 테스트가 만든 것만 골라 본다 — 테스트 DB 에 다른 기록이 있어도 흔들리지 않는다. */
  const mine = <T extends { targetId: string | null }>(rows: T[]): T[] =>
    rows.filter((r) => r.targetId?.startsWith(TARGET));

  it('기본은 사람이 한 일만 보여 준다 — 크론이 목록을 덮지 않는다', async () => {
    const page = await listAuditLogs(db, { limit: 200 });
    const ids = mine(page.rows).map((r) => r.targetId);
    expect(ids).toContain(`${TARGET}-1`);
    expect(ids).not.toContain(`${TARGET}-4`); // cron.publish
    expect(ids).not.toContain(`${TARGET}-5`); // batch.generate_draft
  });

  it('자동 작업 포함을 켜면 크론 기록도 나온다', async () => {
    const page = await listAuditLogs(db, { includeAutomated: true, limit: 200 });
    const ids = mine(page.rows).map((r) => r.targetId);
    expect(ids).toContain(`${TARGET}-4`);
    expect(ids).toContain(`${TARGET}-5`);
  });

  it('대분류는 접두사로 좁힌다', async () => {
    const page = await listAuditLogs(db, { group: 'document', limit: 200 });
    const ids = mine(page.rows).map((r) => r.targetId);
    expect(ids.sort()).toEqual([`${TARGET}-1`, `${TARGET}-2`]);
  });

  it('주의 표시만 보기는 [high] 가 붙은 것만 고른다', async () => {
    const page = await listAuditLogs(db, { highOnly: true, limit: 200 });
    const ids = mine(page.rows).map((r) => r.targetId);
    expect(ids).toEqual([`${TARGET}-3`]);
  });

  it('한 사람으로 좁힌다', async () => {
    const page = await listAuditLogs(db, { actorUserId: actorA, limit: 200 });
    const ids = mine(page.rows).map((r) => r.targetId).sort();
    expect(ids).toEqual([`${TARGET}-1`, `${TARGET}-2`]);
  });

  // 행위자로 좁혀서 본다 — 기간만 걸면 테스트 DB 의 다른 기록이 200칸을 먼저 채워서
  // 가장 오래된 우리 행이 잘려 나간다(코드가 아니라 픽스처가 만드는 실패다).
  it('기간 필터가 오래된 기록을 뺀다', async () => {
    const recent = await listAuditLogs(db, { days: 3650, actorUserId: actorB, limit: 200 });
    expect(mine(recent.rows).map((r) => r.targetId)).toContain(`${TARGET}-6`);
    const short = await listAuditLogs(db, { days: 1, actorUserId: actorB, limit: 200 });
    expect(mine(short.rows).map((r) => r.targetId)).not.toContain(`${TARGET}-6`);
  });

  // 커서가 시각만 봤다면 같은 시각 3건에서 겹치거나 빠진다.
  it('같은 시각 기록도 이어보기에서 겹치거나 빠지지 않는다', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 20; i++) {
      const page: Awaited<ReturnType<typeof listAuditLogs>> = await listAuditLogs(db, { limit: 1, cursor });
      seen.push(...page.rows.map((r) => r.targetId ?? ''));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    const ours = seen.filter((t) => t.startsWith(TARGET));
    expect(new Set(ours).size).toBe(ours.length); // 겹치지 않는다
    expect(ours).toEqual(expect.arrayContaining([`${TARGET}-1`, `${TARGET}-2`, `${TARGET}-3`]));
  });

  it('전체 건수는 이어봐도 줄지 않는다', async () => {
    const first = await listAuditLogs(db, { limit: 1 });
    const second = await listAuditLogs(db, { limit: 1, cursor: first.nextCursor });
    expect(second.total).toBe(first.total);
  });

  it('이전값→새값을 그대로 싣는다', async () => {
    const page = await listAuditLogs(db, { highOnly: true, limit: 200 });
    const row = mine(page.rows)[0]!;
    expect(row.before).toEqual({ role: 'staff' });
    expect(row.after).toEqual({ role: 'board' });
    expect(row.actorName).toBe('QA감사B');
  });

  it('행위자 목록에는 기록을 남긴 사람만 들어간다', async () => {
    const actors = await listAuditActors(db);
    const names = actors.map((a) => a.name);
    expect(names).toContain('QA감사A');
    expect(names).toContain('QA감사B');
    // 크론(actor 없음)은 사람 목록에 끼지 않는다 — innerJoin 이 걸러야 한다.
    expect(actors.every((a) => a.id)).toBe(true);
  });

  it('탈퇴한 계정의 이름은 감춘다', async () => {
    await db.update(users).set({ withdrawnAt: new Date() }).where(eq(users.id, actorA));
    try {
      const page = await listAuditLogs(db, { actorUserId: actorA, limit: 200 });
      expect(mine(page.rows)[0]!.actorName).toBeNull();
      const actors = await listAuditActors(db);
      expect(actors.find((a) => a.id === actorA)?.name).toBe('탈퇴한 회원');
    } finally {
      await db.update(users).set({ withdrawnAt: null }).where(eq(users.id, actorA));
    }
  });
});
