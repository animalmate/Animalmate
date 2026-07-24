// 세션 무효화(users.session_version) + 회장단 전원 잠금 방지.
//
// 세션은 stateless JWT 라 발급 후 "취소"가 불가능하다. 세대 번호를 올려 이전 세대로 서명된
// 토큰을 한 번에 무효화하는 방식이 실제로 동작하는지, 그리고 마지막 권한자를 잃어
// 콘솔이 잠기는 사고가 막히는지 확인한다.

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { users, memberships, auditLogs } from '@/db/schema';
import { loadActor } from '@/auth/auth-service';
import { revokeSessions, setMemberRole, setMemberActive, MemberError } from '@/auth/members';
import { signSession, verifySession } from '@/auth/session';
import type { Actor } from '@/auth/permissions';

const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const suite = DIRECT_URL ? describe : describe.skip;

const SECRET = 'session-revoke-test-secret';
const EMAILS = {
  boardA: 'revoke-board-a@example.invalid',
  boardB: 'revoke-board-b@example.invalid',
  staff: 'revoke-staff@example.invalid',
};

suite('세션 무효화 + 전원 잠금 방지', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  const ids: Record<string, string> = {};
  let boardA: Actor;

  async function cleanup() {
    const us = await db.select({ id: users.id }).from(users).where(inArray(users.email, Object.values(EMAILS)));
    const uids = us.map((u) => u.id);
    if (uids.length) {
      await db.delete(auditLogs).where(inArray(auditLogs.targetId, uids));
      await db.delete(memberships).where(inArray(memberships.userId, uids));
      await db.delete(users).where(inArray(users.id, uids));
    }
  }

  async function mkUser(email: string, role: 'member' | 'staff' | 'board' | 'sysadmin') {
    const [u] = await db.insert(users).values({ email, name: email.split('@')[0]! }).returning();
    await db.insert(memberships).values({
      userId: u!.id,
      role,
      termStart: '2026-03-01',
      termEnd: '2026-12-31',
      status: 'active',
    });
    return u!.id;
  }

  beforeAll(async () => {
    sql = postgres(DIRECT_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup();
    ids.boardA = await mkUser(EMAILS.boardA, 'board');
    ids.boardB = await mkUser(EMAILS.boardB, 'board');
    ids.staff = await mkUser(EMAILS.staff, 'staff');
    boardA = { userId: ids.boardA!, role: 'board', membershipActive: true, teams: [] };
  });

  afterAll(async () => {
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  it('기존 세션은 세대가 같은 동안 유효하다', async () => {
    const token = signSession({ sub: ids.staff!, role: 'staff', sv: 0 }, SECRET);
    const p = verifySession(token, SECRET)!;
    expect(await loadActor(db, p.sub, p.sv)).not.toBeNull();
  });

  it('"모든 기기에서 로그아웃" 후 그 토큰은 즉시 무효가 된다', async () => {
    const token = signSession({ sub: ids.staff!, role: 'staff', sv: 0 }, SECRET);
    const p = verifySession(token, SECRET)!;

    await revokeSessions(db, boardA, ids.staff!);

    // 서명·만료는 여전히 유효하다 — 무효화의 근거는 오직 세대 번호다.
    expect(verifySession(token, SECRET)).not.toBeNull();
    expect(await loadActor(db, p.sub, p.sv)).toBeNull();
  });

  it('다시 로그인해 받은 새 세대 토큰은 통과한다', async () => {
    const [u] = await db.select({ sv: users.sessionVersion }).from(users).where(eq(users.id, ids.staff!)).limit(1);
    const fresh = signSession({ sub: ids.staff!, role: 'staff', sv: u!.sv }, SECRET);
    const p = verifySession(fresh, SECRET)!;
    expect(await loadActor(db, p.sub, p.sv)).not.toBeNull();
  });

  it('무효화는 그 계정만 — 남의 세션은 멀쩡하다', async () => {
    const other = signSession({ sub: ids.boardB!, role: 'board', sv: 0 }, SECRET);
    const p = verifySession(other, SECRET)!;
    expect(await loadActor(db, p.sub, p.sv)).not.toBeNull();
  });

  it('강제 로그아웃은 audit 에 남고, 회장단 대상이면 [high] 로 표시된다', async () => {
    await revokeSessions(db, boardA, ids.boardB!);
    const [log] = await db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.targetId, ids.boardB!));
    expect(log?.action).toContain('session.revoke_all');
    expect(log?.action).toContain('[high]');
  });

  it('회장단이 둘 이상이면 한 명을 강등할 수 있다(회장단 교체는 회장단이 스스로 한다)', async () => {
    await setMemberRole(db, boardA, ids.boardB!, 'staff');
    const [m] = await db.select({ role: memberships.role }).from(memberships).where(eq(memberships.userId, ids.boardB!));
    expect(m?.role).toBe('staff');
    await setMemberRole(db, boardA, ids.boardB!, 'board'); // 원복
  });

  it('회장단 대상 강등·비활성화는 audit 에 [high] 로 남는다', async () => {
    await setMemberActive(db, boardA, ids.boardB!, false);
    const logs = await db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.targetId, ids.boardB!));
    expect(logs.some((l) => l.action.startsWith('membership.deactivate') && l.action.includes('[high]'))).toBe(true);
    await setMemberActive(db, boardA, ids.boardB!, true); // 원복
  });

  it('부원 대상 변경에는 [high] 를 붙이지 않는다(중요 표시가 흔해지면 의미가 없다)', async () => {
    await setMemberRole(db, boardA, ids.staff!, 'member');
    const logs = await db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.targetId, ids.staff!));
    const roleLogs = logs.filter((l) => l.action.startsWith('membership.set_role'));
    expect(roleLogs.length).toBeGreaterThan(0);
    expect(roleLogs.every((l) => !l.action.includes('[high]'))).toBe(true);
  });

  // 결정 13 — 비활성화·강등은 "지금 접근을 끊는다"는 뜻이므로 세션도 함께 끊는다.
  // (쓰기는 membershipActive 로 이미 막히지만, 화면 열람이 남는 것이 의도와 어긋난다.)
  it('비활성화하면 그 계정의 기존 세션이 즉시 무효가 된다', async () => {
    const [before] = await db.select({ sv: users.sessionVersion }).from(users).where(eq(users.id, ids.staff!)).limit(1);
    const token = signSession({ sub: ids.staff!, role: 'staff', sv: before!.sv }, SECRET);
    const p = verifySession(token, SECRET)!;
    expect(await loadActor(db, p.sub, p.sv)).not.toBeNull(); // 아직 살아 있다

    await setMemberActive(db, boardA, ids.staff!, false);
    expect(await loadActor(db, p.sub, p.sv)).toBeNull(); // 화면 열람까지 끊긴다

    await setMemberActive(db, boardA, ids.staff!, true); // 원복
  });

  it('재활성화는 세션을 끊지 않는다(끊을 이유가 없다)', async () => {
    const [before] = await db.select({ sv: users.sessionVersion }).from(users).where(eq(users.id, ids.staff!)).limit(1);
    await setMemberActive(db, boardA, ids.staff!, true);
    const [after] = await db.select({ sv: users.sessionVersion }).from(users).where(eq(users.id, ids.staff!)).limit(1);
    expect(after!.sv).toBe(before!.sv);
  });

  it('강등하면 세션이 끊긴다 — 이전 역할로 발급된 토큰이 살아 있을 이유가 없다', async () => {
    await setMemberRole(db, boardA, ids.staff!, 'staff'); // 기준 상태
    const [before] = await db.select({ sv: users.sessionVersion }).from(users).where(eq(users.id, ids.staff!)).limit(1);
    const token = signSession({ sub: ids.staff!, role: 'staff', sv: before!.sv }, SECRET);
    const p = verifySession(token, SECRET)!;
    expect(await loadActor(db, p.sub, p.sv)).not.toBeNull();

    await setMemberRole(db, boardA, ids.staff!, 'member'); // staff → member = 강등
    expect(await loadActor(db, p.sub, p.sv)).toBeNull();
  });

  it('승격은 세션을 끊지 않는다(로그인 중 승격돼도 다시 로그인할 필요 없다)', async () => {
    const [before] = await db.select({ sv: users.sessionVersion }).from(users).where(eq(users.id, ids.staff!)).limit(1);
    const token = signSession({ sub: ids.staff!, role: 'member', sv: before!.sv }, SECRET);
    const p = verifySession(token, SECRET)!;

    await setMemberRole(db, boardA, ids.staff!, 'staff'); // member → staff = 승격
    const actor = await loadActor(db, p.sub, p.sv);
    expect(actor).not.toBeNull();
    expect(actor!.role).toBe('staff'); // 역할은 DB 기준이라 토큰 재발급 없이 바로 반영된다
  });

  it('세션을 끊었는지 여부가 audit 에 남는다', async () => {
    const logs = await db
      .select({ action: auditLogs.action, after: auditLogs.afterJson })
      .from(auditLogs)
      .where(eq(auditLogs.targetId, ids.staff!));
    const demote = logs.find(
      (l) => l.action.startsWith('membership.set_role') && (l.after as { role?: string })?.role === 'member'
    );
    expect((demote!.after as { sessionsRevoked?: boolean }).sessionsRevoked).toBe(true);
    const promote = logs.find(
      (l) => l.action.startsWith('membership.set_role') && (l.after as { role?: string })?.role === 'staff'
    );
    expect((promote!.after as { sessionsRevoked?: boolean }).sessionsRevoked).toBe(false);
  });

  it('본인 계정은 여전히 스스로 바꿀 수 없다(자가 승격 방지)', async () => {
    await expect(setMemberRole(db, boardA, ids.boardA!, 'sysadmin')).rejects.toBeInstanceOf(MemberError);
    await expect(setMemberRole(db, boardA, ids.boardA!, 'sysadmin')).rejects.toMatchObject({
      code: 'self_forbidden',
    });
  });

  // 마지막 권한자 보호(last_privileged)는 "DB 전체의 활성 권한자 수"라는 전역 상태에 달려 있어
  // 실 계정이 들어 있는 공용 DB 에서는 조건을 재현할 수 없다.
  // 규칙 자체는 src/auth/members.test.ts 의 wouldRemoveLastPrivileged 단위 테스트가 고정한다.
});
