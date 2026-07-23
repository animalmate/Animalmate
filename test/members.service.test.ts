import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { users, memberships, auditLogs } from '@/db/schema';
import { setMemberRole, setMemberActive, listMembers, MemberError } from '@/auth/members';
import { PermissionError } from '@/auth/guard';
import type { Actor } from '@/auth/permissions';

const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const suite = DIRECT_URL ? describe : describe.skip;

const EMAILS = {
  target: 'member-mgmt-target@example.invalid',
  board: 'member-mgmt-board@example.invalid',
  sys: 'member-mgmt-sys@example.invalid',
  sysTarget: 'member-mgmt-systarget@example.invalid',
};

suite('회원 권한 관리 보안 가드(setMemberRole/Active)', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let targetId: string;
  let sysTargetId: string;
  let boardActor: Actor;
  let sysActor: Actor;
  let staffActor: Actor;

  async function cleanup() {
    const us = await db.select({ id: users.id }).from(users).where(inArray(users.email, Object.values(EMAILS)));
    for (const u of us) {
      await db.delete(auditLogs).where(eq(auditLogs.actorUserId, u.id));
      await db.delete(auditLogs).where(inArray(auditLogs.targetId, [u.id]));
      await db.delete(memberships).where(eq(memberships.userId, u.id));
      await db.delete(users).where(eq(users.id, u.id));
    }
  }

  async function role(userId: string): Promise<string[]> {
    const rows = await db.select({ role: memberships.role, status: memberships.status }).from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.status, 'active')));
    return rows.map((r) => r.role);
  }
  const mk = async (email: string, r: 'member' | 'staff' | 'board' | 'sysadmin') => {
    const [u] = await db.insert(users).values({ email, name: email.split('@')[0]! }).returning();
    await db.insert(memberships).values({ userId: u!.id, role: r, termStart: '2026-01-01', termEnd: '2030-01-01', status: 'active' });
    return u!.id;
  };

  beforeAll(async () => {
    sql = postgres(DIRECT_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup();
    targetId = await mk(EMAILS.target, 'member');
    const boardId = await mk(EMAILS.board, 'board');
    const sysId = await mk(EMAILS.sys, 'sysadmin');
    sysTargetId = await mk(EMAILS.sysTarget, 'sysadmin');
    boardActor = { userId: boardId, role: 'board', membershipActive: true, teams: [] };
    sysActor = { userId: sysId, role: 'sysadmin', membershipActive: true, teams: [] };
    staffActor = { userId: boardId, role: 'staff', membershipActive: true, teams: [] };
  });

  afterAll(async () => {
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  it('운영진(비회장단)은 역할 변경 불가(403)', async () => {
    await expect(setMemberRole(db, staffActor, targetId, 'staff')).rejects.toBeInstanceOf(PermissionError);
  });

  it('본인 계정 변경 불가(self_forbidden)', async () => {
    await expect(setMemberRole(db, boardActor, boardActor.userId, 'member')).rejects.toMatchObject({ code: 'self_forbidden' });
  });

  it('회장단은 sysadmin 부여 불가(sysadmin_only)', async () => {
    await expect(setMemberRole(db, boardActor, targetId, 'sysadmin')).rejects.toMatchObject({ code: 'sysadmin_only' });
  });

  it('회장단은 sysadmin 강등 불가(sysadmin_only)', async () => {
    await expect(setMemberRole(db, boardActor, sysTargetId, 'member')).rejects.toMatchObject({ code: 'sysadmin_only' });
  });

  it('잘못된 역할 → bad_role', async () => {
    await expect(setMemberRole(db, sysActor, targetId, 'hacker')).rejects.toMatchObject({ code: 'bad_role' });
  });

  it('회장단이 부원→운영진 승격 성공', async () => {
    await setMemberRole(db, boardActor, targetId, 'staff');
    expect(await role(targetId)).toEqual(['staff']);
  });

  it('시스템관리자는 운영진→회장단 지정 성공, 다시 부원으로 강등', async () => {
    await setMemberRole(db, sysActor, targetId, 'board');
    expect(await role(targetId)).toEqual(['board']);
    await setMemberRole(db, sysActor, targetId, 'member');
    expect(await role(targetId)).toEqual(['member']);
  });

  it('비활성화 → 활성 멤버십 사라짐, 다시 활성화', async () => {
    await setMemberActive(db, boardActor, targetId, false);
    expect(await role(targetId)).toEqual([]);
    const list = await listMembers(db);
    expect(list.find((m) => m.userId === targetId)?.active).toBe(false);
    await setMemberActive(db, boardActor, targetId, true);
    expect(await role(targetId)).toEqual(['member']);
  });

  it('회장단은 sysadmin 비활성화 불가(sysadmin_only)', async () => {
    await expect(setMemberActive(db, boardActor, sysTargetId, false)).rejects.toMatchObject({ code: 'sysadmin_only' });
  });
});
