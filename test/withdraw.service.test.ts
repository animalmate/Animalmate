import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { users, memberships, teamMembers, teams, auditLogs } from '@/db/schema';
import { withdrawMember, listMembers, WITHDRAWN_NAME } from '@/auth/members';
import { loadActor } from '@/auth/auth-service';
import { PermissionError } from '@/auth/guard';
import type { Actor } from '@/auth/permissions';

const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const suite = DIRECT_URL ? describe : describe.skip;

// 이 테스트는 공용 DB 에 붙는다(테스트 전용 DB 가 아니다) — 만든 것만 지운다.
const EMAILS = {
  target: 'withdraw-target@example.invalid',
  self: 'withdraw-self@example.invalid',
  board: 'withdraw-board@example.invalid',
  staff: 'withdraw-staff@example.invalid',
};
const TEAM_NAME = '탈퇴테스트팀';

suite('회원 탈퇴(withdrawMember) — 개인정보 삭제 + 영구 잠금', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  const created: string[] = []; // 이 테스트가 만든 user id (익명화 후에는 이메일로 못 찾는다)
  let teamId: string;
  let withdrawnTargetId: string; // 첫 테스트에서 탈퇴시킨 계정(뒤 테스트가 이어서 검사한다)
  let boardActor: Actor;
  let staffActor: Actor;

  async function cleanup() {
    const byEmail = await db.select({ id: users.id }).from(users).where(inArray(users.email, Object.values(EMAILS)));
    const ids = [...new Set([...created, ...byEmail.map((u) => u.id)])];
    for (const id of ids) {
      await db.delete(auditLogs).where(eq(auditLogs.actorUserId, id));
      await db.delete(auditLogs).where(eq(auditLogs.targetId, id));
      await db.delete(teamMembers).where(eq(teamMembers.userId, id));
      await db.delete(memberships).where(eq(memberships.userId, id));
      await db.delete(users).where(eq(users.id, id));
    }
    await db.delete(teams).where(eq(teams.name, TEAM_NAME));
  }

  const mk = async (email: string, role: 'member' | 'staff' | 'board' | 'sysadmin', phone?: string) => {
    const [u] = await db.insert(users).values({ email, name: email.split('@')[0]!, phone: phone ?? null }).returning();
    await db.insert(memberships).values({ userId: u!.id, role, termStart: '2026-01-01', termEnd: '2030-01-01', status: 'active' });
    created.push(u!.id);
    return u!.id;
  };

  beforeAll(async () => {
    sql = postgres(DIRECT_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup();
    const [t] = await db.insert(teams).values({ name: TEAM_NAME, kind: 'activity' }).returning();
    teamId = t!.id;
    const boardId = await mk(EMAILS.board, 'board');
    const staffId = await mk(EMAILS.staff, 'staff');
    boardActor = { userId: boardId, role: 'board', membershipActive: true, teams: [] };
    staffActor = { userId: staffId, role: 'staff', membershipActive: true, teams: [] };
  });

  afterAll(async () => {
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  it('강제 탈퇴: 이름·이메일·전화가 지워지고 멤버십·팀 배정이 사라진다', async () => {
    const id = await mk(EMAILS.target, 'member', '010-0000-0000');
    withdrawnTargetId = id;
    await db.insert(teamMembers).values({ teamId, userId: id, position: 'member' });
    const [before] = await db.select({ v: users.sessionVersion }).from(users).where(eq(users.id, id)).limit(1);

    await withdrawMember(db, boardActor, id);

    const [after] = await db
      .select({ name: users.name, email: users.email, phone: users.phone, withdrawnAt: users.withdrawnAt, v: users.sessionVersion })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    expect(after!.name).toBe(WITHDRAWN_NAME);
    expect(after!.email).not.toContain('withdraw-target'); // 원래 주소가 남지 않는다
    expect(after!.phone).toBeNull();
    expect(after!.withdrawnAt).not.toBeNull();
    // 열려 있던 세션은 즉시 무효가 되어야 한다.
    expect(after!.v).toBe(before!.v + 1);

    const ms = await db.select({ status: memberships.status }).from(memberships).where(eq(memberships.userId, id));
    expect(ms.every((m) => m.status === 'expired')).toBe(true);
    const tms = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.userId, id));
    expect(tms).toHaveLength(0);
  });

  it('탈퇴 계정은 다시 로그인/세션 복구가 안 된다(loadActor 가 거부)', async () => {
    const id = withdrawnTargetId;
    const [row] = await db.select({ v: users.sessionVersion }).from(users).where(eq(users.id, id)).limit(1);
    expect(await loadActor(db, id, row!.v)).toBeNull();
    expect(await loadActor(db, id)).toBeNull();
  });

  it('탈퇴 계정은 회원 명단에 나오지 않는다', async () => {
    const list = await listMembers(db);
    expect(list.some((m) => m.name === WITHDRAWN_NAME)).toBe(false);
    expect(list.some((m) => m.email === EMAILS.target)).toBe(false);
  });

  it('같은 이메일로 다시 가입할 수 있다(원래 주소를 남기지 않으므로)', async () => {
    const again = await mk(EMAILS.target, 'member');
    expect(again).toBeTruthy();
    const [row] = await db.select({ withdrawnAt: users.withdrawnAt }).from(users).where(eq(users.id, again)).limit(1);
    expect(row!.withdrawnAt).toBeNull(); // 별개의 새 계정
  });

  it('이미 탈퇴한 계정은 다시 탈퇴시킬 수 없다', async () => {
    const id = await mk('withdraw-twice@example.invalid', 'member');
    await withdrawMember(db, boardActor, id);
    await expect(withdrawMember(db, boardActor, id)).rejects.toMatchObject({ code: 'already_withdrawn' });
    await db.delete(auditLogs).where(eq(auditLogs.targetId, id));
    await db.delete(memberships).where(eq(memberships.userId, id));
    await db.delete(users).where(eq(users.id, id));
  });

  it('운영진은 남을 탈퇴시킬 수 없다(403)', async () => {
    const id = await mk('withdraw-victim@example.invalid', 'member');
    await expect(withdrawMember(db, staffActor, id)).rejects.toBeInstanceOf(PermissionError);
    await db.delete(memberships).where(eq(memberships.userId, id));
    await db.delete(users).where(eq(users.id, id));
  });

  it('본인 탈퇴는 권한 없이도 된다 — 부원이 스스로 나갈 수 있어야 한다', async () => {
    const id = await mk(EMAILS.self, 'member');
    const selfActor: Actor = { userId: id, role: 'member', membershipActive: true, teams: [] };
    await withdrawMember(db, selfActor, id);
    const [row] = await db.select({ name: users.name }).from(users).where(eq(users.id, id)).limit(1);
    expect(row!.name).toBe(WITHDRAWN_NAME);
  });

  it('탈퇴 기록에 이름·이메일·전화를 남기지 않는다(방금 지운 개인정보를 감사 로그로 옮기지 않는다)', async () => {
    const id = await mk('withdraw-audit@example.invalid', 'member', '010-1111-2222');
    await withdrawMember(db, boardActor, id);
    const rows = await db
      .select({ before: auditLogs.beforeJson, after: auditLogs.afterJson })
      .from(auditLogs)
      .where(eq(auditLogs.targetId, id));
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain('withdraw-audit');
    expect(dump).not.toContain('010-1111-2222');
    await db.delete(auditLogs).where(eq(auditLogs.targetId, id));
    await db.delete(memberships).where(eq(memberships.userId, id));
    await db.delete(users).where(eq(users.id, id));
  });
});
