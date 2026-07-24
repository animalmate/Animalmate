// 인증 오케스트레이션 — 가입(가입코드+OTP)/로그인(OTP), 세션 발급, 현재 사용자(Actor) 로딩.
// 데이터 접근은 서버(service role) db 주입. 메일러/시각/secret 주입으로 테스트 가능.

import { and, eq } from 'drizzle-orm';
import { users, memberships, teamMembers } from '@/db/schema';
import type { Db, Database } from '@/db/types';
import type { Actor, ActorTeam, Role } from '@/auth/permissions';
import { validateJoinCode } from './join-codes';
import { createEmailCode, verifyEmailCode, CooldownError } from './otp';
import { signSession } from './session';
import { alreadyRegisteredMail, type Mailer } from './mailer';

type DB = Db;

export class AuthError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400
  ) {
    super(code);
    this.name = 'AuthError';
  }
}

export interface AuthCtx {
  secret: string;
  mailer: Mailer;
  now?: Date;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const norm = (email: string) => email.trim().toLowerCase();
const ROLE_RANK: Record<Role, number> = { member: 0, staff: 1, board: 2, sysadmin: 2 };

function fmtDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function getUserByEmail(db: Database, email: string) {
  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return u ?? null;
}

// ── 가입 ───────────────────────────────────────────────────────────────
/**
 * 가입 1단계. **응답은 가입 여부와 무관하게 항상 동일**하다(계정 열거 차단).
 *
 * 가입코드는 300명 부원 전원이 아는 값이라, 코드만 있으면 임의 주소의 가입 여부를 캐낼 수 있었다
 * (기가입 → 409). 이제 구분 정보는 HTTP 응답이 아니라 **메일함(본인만 보는 채널)** 으로만 간다:
 *  - 미가입 → 인증 코드 메일
 *  - 기가입 → "이미 가입된 계정입니다" 안내 메일
 * 호출부는 성공/실패를 구분하지 말고 항상 같은 문구를 보여줘야 한다.
 */
export async function requestSignup(
  db: DB,
  input: { email: string; joinCode: string },
  ctx: AuthCtx
): Promise<void> {
  const email = norm(input.email);
  if (!EMAIL_RE.test(email)) throw new AuthError('invalid_email');
  if (!(await validateJoinCode(db, input.joinCode))) throw new AuthError('invalid_join_code', 403);

  if (await getUserByEmail(db, email)) {
    await ctx.mailer.send(alreadyRegisteredMail(email));
    return; // 미가입 경로와 동일한 성공 응답
  }
  await sendOtpIgnoringCooldown(db, email, 'signup', ctx);
}

/**
 * OTP 발급·발송. 재전송 쿨다운에 걸리면 **조용히 넘어간다**.
 *
 * 쿨다운을 그대로 던지면 그 자체가 열거 오라클이 된다: 같은 주소로 60초 안에 두 번 요청했을 때
 * 코드가 발급되는 경로(미가입/가입됨)만 429 가 나므로 응답이 갈린다. 어차피 응답 문구는
 * "보냈습니다" 로 통일돼 있고 첫 메일은 이미 받은 상태라, 두 번째를 안 보내는 편이 맞다.
 * 폭주 방어는 라우트의 IP·이메일 레이트 리밋이 담당한다.
 */
async function sendOtpIgnoringCooldown(
  db: DB,
  email: string,
  purpose: 'signup' | 'login',
  ctx: AuthCtx
): Promise<void> {
  let code: string;
  try {
    code = await createEmailCode(db, { email, purpose, secret: ctx.secret, now: ctx.now });
  } catch (e) {
    if (e instanceof CooldownError) return;
    throw e;
  }
  await ctx.mailer.sendOtp({ to: email, code, purpose });
}

export async function verifySignup(
  db: DB,
  input: { email: string; code: string; name?: string },
  ctx: AuthCtx
): Promise<{ token: string; userId: string }> {
  const email = norm(input.email);
  const res = await verifyEmailCode(db, { email, purpose: 'signup', code: input.code, secret: ctx.secret, now: ctx.now });
  if (res !== 'ok') throw new AuthError(`otp_${res}`);

  const now = ctx.now ?? new Date();
  const termStart = fmtDate(now);
  const termEnd = fmtDate(new Date(now.getTime() + 183 * 86_400_000)); // ~한 학기

  const user = await db.transaction(async (tx) => {
    if (await getUserByEmail(tx, email)) throw new AuthError('already_registered', 409);
    const [u] = await tx
      .insert(users)
      .values({ email, name: input.name?.trim() || email.split('@')[0]! })
      .returning();
    await tx.insert(memberships).values({ userId: u!.id, role: 'member', termStart, termEnd, status: 'active' });
    return u!;
  });

  return {
    token: signSession({ sub: user.id, role: 'member', sv: user.sessionVersion }, ctx.secret),
    userId: user.id,
  };
}

// ── 로그인 ─────────────────────────────────────────────────────────────
export async function requestLogin(db: DB, input: { email: string }, ctx: AuthCtx): Promise<void> {
  const email = norm(input.email);
  const user = await getUserByEmail(db, email);
  if (!user) return; // 계정 열거 방지: 없어도 조용히 성공처럼 반환(코드 미발송)
  // 쿨다운을 던지면 "가입된 주소만 429" 가 되어 열거가 뚫린다(가입 경로와 같은 이유).
  await sendOtpIgnoringCooldown(db, email, 'login', ctx);
}

export async function verifyLogin(
  db: DB,
  input: { email: string; code: string },
  ctx: AuthCtx
): Promise<{ token: string; userId: string; role: Role }> {
  const email = norm(input.email);
  const res = await verifyEmailCode(db, { email, purpose: 'login', code: input.code, secret: ctx.secret, now: ctx.now });
  if (res !== 'ok') throw new AuthError(`otp_${res}`);
  const user = await getUserByEmail(db, email);
  if (!user) throw new AuthError('otp_not_found');
  const role = await currentRole(db, user.id, ctx.now);
  return {
    token: signSession({ sub: user.id, role, sv: user.sessionVersion }, ctx.secret),
    userId: user.id,
    role,
  };
}

// ── 현재 사용자 ────────────────────────────────────────────────────────
/** 활성 멤버십 중 최고 권한 역할(없으면 member). 임기 만료는 status=expired 로 크론이 처리. */
async function currentRole(db: DB, userId: string, _now?: Date): Promise<Role> {
  const rows = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active')));
  let best: Role = 'member';
  for (const r of rows) if (ROLE_RANK[r.role] > ROLE_RANK[best]) best = r.role;
  return best;
}

/**
 * userId 로 인가용 Actor 를 DB 에서 구성(권한 판단의 진실은 항상 DB). 세션 JWT 는 sub 만 신뢰.
 * 활성 멤버십이 없으면 membershipActive=false → 쓰기 전면 거부(authorize).
 *
 * @param sessionVersion 세션 토큰에 담겨 온 세대 번호. 주면 DB 값과 대조해 다를 때 null(=로그아웃)
 *   을 돌려준다. 이미 실행하던 users SELECT 에 컬럼 하나를 얹은 것이라 추가 조회가 없다.
 */
export async function loadActor(db: DB, userId: string, sessionVersion?: number): Promise<Actor | null> {
  const [u] = await db
    .select({ id: users.id, sessionVersion: users.sessionVersion })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) return null;
  // "모든 기기에서 로그아웃" 이후 발급된 토큰만 통과한다.
  if (sessionVersion !== undefined && sessionVersion !== u.sessionVersion) return null;
  const ms = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active')));
  const tms = await db
    .select({ teamId: teamMembers.teamId, position: teamMembers.position })
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId));
  let role: Role = 'member';
  for (const r of ms) if (ROLE_RANK[r.role] > ROLE_RANK[role]) role = r.role;
  const teams: ActorTeam[] = tms.map((t) => ({ teamId: t.teamId, position: t.position }));
  return { userId, role, membershipActive: ms.length > 0, teams };
}
