import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { teams, users, postTemplates, auditLogs } from '@/db/schema';
import { listUsableTemplates, updateTemplate } from '@/publishing/post-templates';
import { PermissionError } from '@/auth/guard';
import type { Actor } from '@/auth/permissions';
import { TEST_DATABASE_URL } from './db-url';

// 양식은 **쓰는 범위와 고치는 범위가 다르다**(2026-07-28).
//  - 쓰기(예약 만들 때 불러오기) = 개인 소유(남의 것)만 빼고 전부. 팀 소속과 무관.
//  - 고치기(수정·삭제)           = 소유자(본인/소속팀) + 회장단. 예전 그대로.
// 이 파일은 그 둘이 실제로 갈라져 있는지를 못박는다. 넓힌 쪽만 보고 좁은 쪽이 함께 열리면
// 남의 팀 양식을 아무나 고칠 수 있게 되는데, 그건 이 변경의 의도가 아니다.
const suite = describe;

const OWNER_EMAIL = 'tpl-scope-owner@example.invalid';
const OTHER_EMAIL = 'tpl-scope-other@example.invalid';
const TEAM_A = 'TPL-TEST-A팀';
const TEAM_B = 'TPL-TEST-B팀';
const NAMES = ['TPL-TEST global', 'TPL-TEST A팀', 'TPL-TEST B팀', 'TPL-TEST 내개인', 'TPL-TEST 남개인'];

suite('양식 스코프 — 쓰는 범위는 넓고, 고치는 범위는 그대로', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let teamAId: string;
  let teamBId: string;
  let meId: string;
  let otherId: string;
  let tplBId: string;
  /** 어느 팀에도 배정되지 않은 운영진 — 예전에는 global 밖에 못 썼다. */
  let staffNoTeam: Actor;
  let board: Actor;

  async function cleanup() {
    const tpls = await db.select({ id: postTemplates.id }).from(postTemplates).where(inArray(postTemplates.name, NAMES));
    const ids = tpls.map((t) => t.id);
    if (ids.length) {
      await db.delete(auditLogs).where(inArray(auditLogs.targetId, ids));
      await db.delete(postTemplates).where(inArray(postTemplates.id, ids));
    }
    const us = await db.select({ id: users.id }).from(users).where(inArray(users.email, [OWNER_EMAIL, OTHER_EMAIL]));
    for (const u of us) {
      await db.delete(auditLogs).where(eq(auditLogs.actorUserId, u.id));
      await db.delete(users).where(eq(users.id, u.id));
    }
    const ts = await db.select({ id: teams.id }).from(teams).where(inArray(teams.name, [TEAM_A, TEAM_B]));
    for (const t of ts) await db.delete(teams).where(eq(teams.id, t.id));
  }

  beforeAll(async () => {
    sql = postgres(TEST_DATABASE_URL, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup();

    const [a] = await db.insert(teams).values({ name: TEAM_A, kind: 'activity' }).returning();
    const [b] = await db.insert(teams).values({ name: TEAM_B, kind: 'activity' }).returning();
    teamAId = a!.id;
    teamBId = b!.id;
    const [me] = await db.insert(users).values({ email: OWNER_EMAIL, name: '양식주인' }).returning();
    const [other] = await db.insert(users).values({ email: OTHER_EMAIL, name: '남' }).returning();
    meId = me!.id;
    otherId = other!.id;

    const seed = async (ownerType: 'global' | 'team' | 'personal', ownerId: string | null, name: string) => {
      const [t] = await db
        .insert(postTemplates)
        .values({ ownerType, ownerId, name, titleTemplate: '{{간결_날짜}} 제목', bodyTemplate: '본문', updatedBy: meId })
        .returning();
      return t!.id;
    };
    await seed('global', null, 'TPL-TEST global');
    await seed('team', teamAId, 'TPL-TEST A팀');
    tplBId = await seed('team', teamBId, 'TPL-TEST B팀');
    await seed('personal', meId, 'TPL-TEST 내개인');
    await seed('personal', otherId, 'TPL-TEST 남개인');

    // 팀 배정이 **비어 있는** 운영진. 이 사람이 이 변경의 주 수혜자다.
    staffNoTeam = { userId: meId, role: 'staff', membershipActive: true, teams: [] };
    board = { userId: meId, role: 'board', membershipActive: true, teams: [] };
  });

  afterAll(async () => {
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  const mine = (rows: { name: string }[]) => rows.map((r) => r.name).filter((n) => NAMES.includes(n)).sort();

  it('팀 배정이 없는 운영진도 **모든 팀** 양식을 쓸 수 있다(예전엔 global 뿐이었다)', async () => {
    const got = mine(await listUsableTemplates(db, staffNoTeam));
    expect(got).toContain('TPL-TEST A팀');
    expect(got).toContain('TPL-TEST B팀');
    expect(got).toContain('TPL-TEST global');
  });

  it('본인 개인 양식은 보이고, 남의 개인 양식은 보이지 않는다', async () => {
    const got = mine(await listUsableTemplates(db, staffNoTeam));
    expect(got).toContain('TPL-TEST 내개인');
    expect(got).not.toContain('TPL-TEST 남개인');
  });

  it('회장단에게도 남의 개인 양식은 보이지 않는다(역할과 무관한 규칙)', async () => {
    const got = mine(await listUsableTemplates(db, board));
    expect(got).not.toContain('TPL-TEST 남개인');
    expect(got).toContain('TPL-TEST B팀');
  });

  // ── 여기부터가 좁은 쪽. 넓힌 것은 "쓰기"뿐이라는 보장. ──────────────────────
  it('남의 팀 양식을 **고치는 것**은 여전히 막힌다(쓸 수 있다고 고칠 수 있는 게 아니다)', async () => {
    const usable = mine(await listUsableTemplates(db, staffNoTeam));
    expect(usable).toContain('TPL-TEST B팀'); // 목록에는 있는데

    await expect(updateTemplate(db, staffNoTeam, tplBId, { name: '몰래수정' })).rejects.toBeInstanceOf(PermissionError);

    const [row] = await db.select({ name: postTemplates.name }).from(postTemplates).where(eq(postTemplates.id, tplBId));
    expect(row!.name).toBe('TPL-TEST B팀'); // 이름이 그대로여야 한다
  });

  it('소속 팀 양식은 고칠 수 있다', async () => {
    const staffInB: Actor = { userId: meId, role: 'staff', membershipActive: true, teams: [{ teamId: teamBId, position: 'leader', canEditNotice: false }] };
    const updated = await updateTemplate(db, staffInB, tplBId, { defaultPlace: '테스트장소' });
    expect(updated.defaultPlace).toBe('테스트장소');
  });
});
