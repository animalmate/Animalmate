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
// 계정 열거 차단 테스트가 만드는 주소들 — cleanup 대상에 포함한다.
const FRESH_EMAIL = 'fresh-enum@example.invalid';
const COOLDOWN_EMAIL = 'cooldown-enum@example.invalid';
const ALL_TEST_EMAILS = [ADMIN_EMAIL, NEW_EMAIL, FRESH_EMAIL, COOLDOWN_EMAIL];
// 이 테스트가 발급하는 가입코드. 정리는 반드시 이 목록으로만 한정한다(실제 코드 삭제 사고 방지).
const TEST_JOIN_CODES = ['FIRSTAAA', 'SECONDBB'];

function captureMailer(): { mailer: Mailer; sent: OtpMail[]; plain: { to: string | string[]; subject: string }[] } {
  const sent: OtpMail[] = [];
  const plain: { to: string | string[]; subject: string }[] = [];
  return {
    mailer: {
      async send(m) { plain.push({ to: m.to, subject: m.subject }); },
      async sendOtp(m) { sent.push(m); },
    },
    sent,
    plain,
  };
}

suite('인증 — 가입코드 + 이메일 OTP', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let board: Actor;
  let member: Actor;
  let adminUserId: string;
  let preexistingActiveCodeId: string | null = null;

  async function cleanup() {
    // ⚠ 이 테스트는 실제 운영 DB(DIRECT_URL)를 대상으로 돌 수 있다.
    // 예전에는 여기서 join_codes 를 **전부** 지웠는데(= "테스트 전용 DB 가정"), 그 가정이 틀려서
    // 통합 테스트를 돌릴 때마다 동아리의 실제 활성 가입코드가 삭제됐다(가입이 조용히 막힌다).
    // 이제 이 테스트가 만든 코드만 지운다. 다른 정리 대상도 전부 테스트 전용 값으로 한정한다.
    const codes = await db.select({ id: joinCodes.id }).from(joinCodes).where(inArray(joinCodes.code, TEST_JOIN_CODES));
    const codeIds = codes.map((c) => c.id);
    if (codeIds.length) await db.delete(auditLogs).where(inArray(auditLogs.targetId, codeIds));
    await db.delete(joinCodes).where(inArray(joinCodes.code, TEST_JOIN_CODES));
    await db.delete(emailCodes).where(inArray(emailCodes.email, ALL_TEST_EMAILS));
    await db.delete(users).where(inArray(users.email, ALL_TEST_EMAILS)); // memberships cascade
  }

  beforeAll(async () => {
    sql = postgres(DIRECT_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    // 활성 가입코드는 항상 1개(부분 유니크 인덱스)라, 이 테스트가 코드를 발급하면
    // 기존 활성 코드가 비활성으로 밀린다 = 실제 가입이 막힌다. 원래 값을 기억해 두고 끝나면 되돌린다.
    const [existing] = await db.select({ id: joinCodes.id }).from(joinCodes).where(eq(joinCodes.isActive, true));
    preexistingActiveCodeId = existing?.id ?? null;
    await cleanup();
    const [u] = await db.insert(users).values({ email: ADMIN_EMAIL, name: '회장' }).returning();
    adminUserId = u!.id;
    board = { userId: adminUserId, role: 'board', membershipActive: true, teams: [] };
    member = { userId: adminUserId, role: 'member', membershipActive: true, teams: [] };
  });

  afterAll(async () => {
    await cleanup();
    // 테스트가 밀어낸 실제 활성 가입코드를 되살린다(되돌리지 않으면 가입이 조용히 막힌다).
    if (preexistingActiveCodeId) {
      await db.update(joinCodes).set({ isActive: true }).where(eq(joinCodes.id, preexistingActiveCodeId));
    }
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

  // 계정 열거 차단(2026-07-24): 가입 요청 응답은 가입 여부와 무관하게 동일하다.
  // "이미 가입됨" 은 메일함 — 본인만 볼 수 있는 채널 — 으로만 알린다.
  it('이미 가입된 이메일 requestSignup → 던지지 않고 안내 메일(코드 미발송)', async () => {
    const { mailer, sent, plain } = captureMailer();
    await expect(
      requestSignup(db, { email: NEW_EMAIL, joinCode: 'SECONDBB' }, { secret: SECRET, mailer })
    ).resolves.toBeUndefined();

    expect(sent).toHaveLength(0); // 인증 코드는 나가지 않는다
    expect(plain).toHaveLength(1);
    expect(plain[0]!.to).toBe(NEW_EMAIL);
    expect(plain[0]!.subject).toContain('이미 가입된 계정');
  });

  it('미가입 이메일 requestSignup → 인증 코드 발송(응답 형태는 기가입과 동일)', async () => {
    const { mailer, sent, plain } = captureMailer();
    await expect(
      requestSignup(db, { email: FRESH_EMAIL, joinCode: 'SECONDBB' }, { secret: SECRET, mailer })
    ).resolves.toBeUndefined(); // 기가입 경로와 구분되지 않는다

    expect(sent).toHaveLength(1);
    expect(plain).toHaveLength(0);
  });

  it('같은 주소로 60초 내 재요청해도 던지지 않는다(쿨다운 429 가 열거 신호가 되지 않게)', async () => {
    const { mailer } = captureMailer();
    const email = COOLDOWN_EMAIL;
    await requestSignup(db, { email, joinCode: 'SECONDBB' }, { secret: SECRET, mailer });
    // 두 번째 요청은 쿨다운에 걸리지만, 기가입 경로와 똑같이 조용히 성공해야 한다.
    await expect(
      requestSignup(db, { email, joinCode: 'SECONDBB' }, { secret: SECRET, mailer })
    ).resolves.toBeUndefined();
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
