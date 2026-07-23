// 인증 오케스트레이션 — 가입(가입코드+OTP)/로그인(OTP), 세션 발급, 현재 사용자(Actor) 로딩.
// 데이터 접근은 서버(service role) db 주입. 메일러/시각/secret 주입으로 테스트 가능.

import { and, eq } from 'drizzle-orm';
import { users, memberships, teamMembers } from '@/db/schema';
import type { Db, Database } from '@/db/types';
import type { Actor, ActorTeam, Role } from '@/auth/permissions';
import { validateJoinCode } from './join-codes';
import { createEmailCode, verifyEmailCode } from './otp';
import { signSession } from './session';
import type { Mailer } from './mailer';

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
export async function requestSignup(
  db: DB,
  input: { email: string; joinCode: string },
  ctx: AuthCtx
): Promise<void> {
  const email = norm(input.email);
  if (!EMAIL_RE.test(email)) throw new AuthError('invalid_email');
  if (!(await validateJoinCode(db, input.joinCode))) throw new AuthError('invalid_join_code', 403);
  if (await getUserByEmail(db, email)) throw new AuthError('already_registered', 409);

  const code = await createEmailCode(db, { email, purpose: 'signup', secret: ctx.secret, now: ctx.now });
  await ctx.mailer.sendOtp({ to: email, code, purpose: 'signup' });
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

  return { token: signSession({ sub: user.id, role: 'member' }, ctx.secret), userId: user.id };
}

// ── 로그인 ─────────────────────────────────────────────────────────────
export async function requestLogin(db: DB, input: { email: string }, ctx: AuthCtx): Promise<void> {
  const email = norm(input.email);
  const user = await getUserByEmail(db, email);
  if (!user) return; // 계정 열거 방지: 없어도 조용히 성공처럼 반환(코드 미발송)
  const code = await createEmailCode(db, { email, purpose: 'login', secret: ctx.secret, now: ctx.now });
  await ctx.mailer.sendOtp({ to: email, code, purpose: 'login' });
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
  return { token: signSession({ sub: user.id, role }, ctx.secret), userId: user.id, role };
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
 */
export async function loadActor(db: DB, userId: string): Promise<Actor | null> {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return null;
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
