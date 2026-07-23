import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { joinCodes, emailCodes, users, memberships, auditLogs } from '@/db/schema';
import { issueJoinCode, validateJoinCode, getActiveJoinCode } from '@/auth/join-codes';
import {
  requestSignup,
  verifySignup,
  requestLogin,
  verifyLogin,
  AuthError,
} from '@/auth/auth-service';
import { verifySession } from '@/auth/session';
import { PermissionError } from '@/auth/guard';
import type { Actor } from '@/auth/permissions';
import type { Mailer, OtpMail } from '@/auth/mailer';

const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const suite = DIRECT_URL ? describe : describe.skip;

const SECRET = 'integration-secret';
const ADMIN_EMAIL = 'auth-admin@example.invalid';
const NEW_EMAIL = 'auth-newbie@example.invalid';

function captureMailer(): { mailer: Mailer; sent: OtpMail[] } {
  const sent: OtpMail[] = [];
  return { mailer: { async send() {}, async sendOtp(m) { sent.push(m); } }, sent };
}

suite('인증 — 가입코드 + 이메일 OTP', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let board: Actor;
  let member: Actor;
  let adminUserId: string;

  async function cleanup() {
    const codes = await db.select({ id: joinCodes.id }).from(joinCodes);
    const codeIds = codes.map((c) => c.id);
    if (codeIds.length) await db.delete(auditLogs).where(inArray(auditLogs.targetId, codeIds));
    await db.delete(joinCodes); // 테스트 전용 DB 가정: 가입코드 전부 정리
    await db.delete(emailCodes).where(inArray(emailCodes.email, [ADMIN_EMAIL, NEW_EMAIL]));
    await db.delete(users).where(inArray(users.email, [ADMIN_EMAIL, NEW_EMAIL])); // memberships cascade
  }

  beforeAll(async () => {
    sql = postgres(DIRECT_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup();
    const [u] = await db.insert(users).values({ email: ADMIN_EMAIL, name: '회장' }).returning();
    adminUserId = u!.id;
    board = { userId: adminUserId, role: 'board', membershipActive: true, teams: [] };
    member = { userId: adminUserId, role: 'member', membershipActive: true, teams: [] };
  });

  afterAll(async () => {
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  it('부원은 가입코드 발급 불가(PermissionError)', async () => {
    await expect(issueJoinCode(db, member, { semesterLabel: '2026-1' })).rejects.toBeInstanceOf(PermissionError);
  });

  it('회장단 가입코드 발급 + 재발급 시 활성 코드는 항상 최신 1개', async () => {
    const first = await issueJoinCode(db, board, { semesterLabel: '2026-1', code: 'FIRSTAAA' });
    expect(await validateJoinCode(db, 'FIRSTAAA')).toBe(true);

    const second = await issueJoinCode(db, board, { semesterLabel: '2026-2', code: 'SECONDBB' });
    const active = await getActiveJoinCode(db);
    expect(active!.id).toBe(second.id);
    expect(await validateJoinCode(db, 'SECONDBB')).toBe(true);
    expect(await validateJoinCode(db, 'FIRSTAAA')).toBe(false); // 이전 코드 비활성
    expect(first.id).not.toBe(second.id);
  });

  it('잘못된 가입코드로 requestSignup → invalid_join_code', async () => {
    const { mailer } = captureMailer();
    await expect(
      requestSignup(db, { email: NEW_EMAIL, joinCode: 'WRONGXXX' }, { secret: SECRET, mailer })
    ).rejects.toMatchObject({ code: 'invalid_join_code' });
  });

  it('가입: 유효 코드 → OTP 발송 → 검증 → user+member 생성 + 세션', async () => {
    const { mailer, sent } = captureMailer();
    await requestSignup(db, { email: NEW_EMAIL, joinCode: 'SECONDBB' }, { secret: SECRET, mailer });
    expect(sent).toHaveLength(1);
    const otp = sent[0]!.code;
    expect(otp).toMatch(/^\d{6}$/);

    // 틀린 코드 → otp_invalid
    await expect(
      verifySignup(db, { email: NEW_EMAIL, code: '000000', name: '신입' }, { secret: SECRET, mailer })
    ).rejects.toMatchObject({ code: 'otp_invalid' });

    // 올바른 코드 → 가입 완료
    const { token, userId } = await verifySignup(
      db,
      { email: NEW_EMAIL, code: otp, name: '신입' },
      { secret: SECRET, mailer }
    );
    const payload = verifySession(token, SECRET);
    expect(payload).toMatchObject({ sub: userId, role: 'member' });

    const [m] = await db.select().from(memberships).where(eq(memberships.userId, userId));
    expect(m).toMatchObject({ role: 'member', status: 'active' });
  });

  it('이미 가입된 이메일 requestSignup → already_registered', async () => {
    const { mailer } = captureMailer();
    await expect(
      requestSignup(db, { email: NEW_EMAIL, joinCode: 'SECONDBB' }, { secret: SECRET, mailer })
    ).rejects.toMatchObject({ code: 'already_registered' });
  });

  it('로그인: 기존 사용자 OTP → 세션(role member)', async () => {
    const { mailer, sent } = captureMailer();
    await requestLogin(db, { email: NEW_EMAIL }, { secret: SECRET, mailer });
    expect(sent).toHaveLength(1);
    const { token, role } = await verifyLogin(db, { email: NEW_EMAIL, code: sent[0]!.code }, { secret: SECRET, mailer });
    expect(role).toBe('member');
    expect(verifySession(token, SECRET)!.role).toBe('member');
  });

  it('로그인: 미가입 이메일 → 조용히 반환(메일 미발송, 계정 열거 방지)', async () => {
    const { mailer, sent } = captureMailer();
    await requestLogin(db, { email: 'ghost@example.invalid' }, { secret: SECRET, mailer });
    expect(sent).toHaveLength(0);
  });
});
