// 인증 오케스트레이션 — 가입(가입코드+OTP)/로그인(OTP), 세션 발급, 현재 사용자(Actor) 로딩.
// 데이터 접근은 서버(service role) db 주입. 메일러/시각/secret 주입으로 테스트 가능.

import { and, eq } from 'drizzle-orm';
import { users, memberships, teamMembers, teams as teamsTable } from '@/db/schema';
import type { Db, Database } from '@/db/types';
import type { Actor, ActorTeam, Role } from '@/auth/permissions';
import { validateJoinCode } from './join-codes';
import { createEmailCode, verifyEmailCode, CooldownError } from './otp';
import { signSession } from './session';
import { alreadyRegisteredMail, type Mailer } from './mailer';
import { isValidEmail, normalizeEmail } from '@/lib/email';

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

// 주소 형식 판단은 `@/lib/email` 하나만 본다 — 여기와 지원서 접수에 각각 정규식을 두면
// 언젠가 한쪽만 고쳐지고, 그때 새는 것은 메일 발송 경로다(그 파일 머리 주석).
const norm = normalizeEmail;
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
  if (!isValidEmail(email)) throw new AuthError('invalid_email');
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
  input: { email: string; code: string; name?: string; phone?: string | null },
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
      .values({ email, name: input.name?.trim() || email.split('@')[0]!, phone: input.phone?.trim() || null })
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
  // 세 조회는 서로를 필요로 하지 않으므로 한 번에 띄운다. 예전에는 순차로 await 해서 왕복이 3번
  // 이었고, 이 함수는 **로그인 상태의 모든 페이지·API 요청이 반드시 지나가는 길목**이라 그 비용이
  // 화면마다 그대로 얹혔다(페이지 HTML + 그 화면이 부르는 API = 요청 하나에 6왕복).
  // users 가 없거나 거부될 때 나머지 둘이 헛도는 셈이지만, 그건 비정상 경로이고 두 조회 다 인덱스
  // 한 방이라 값이 싸다 — 정상 경로에서 왕복 2번을 없애는 쪽이 훨씬 크다.
  const [[u], ms, tms] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        sessionVersion: users.sessionVersion,
        withdrawnAt: users.withdrawnAt,
        // 이미 읽고 있는 행에 컬럼 하나를 얹는 것이라 추가 왕복이 없다(session_version 과 같은 이유).
        lastSeenAt: users.lastSeenAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active'))),
    // teams 를 조인하는 이유: 공고 편집 권한이 팀 플래그(can_edit_notice)에 있다(0032).
    // team_members 만 읽으면 팀 이름으로 판단하는 옛 방식으로 되돌아간다(07-DECISIONS 66).
    // 별칭(teamsTable)을 쓰는 것은 아래 지역 변수 `teams` 와 이름이 겹치기 때문이다.
    db
      .select({
        teamId: teamMembers.teamId,
        position: teamMembers.position,
        canEditNotice: teamsTable.canEditNotice,
        teamActive: teamsTable.isActive,
      })
      .from(teamMembers)
      .innerJoin(teamsTable, eq(teamsTable.id, teamMembers.teamId))
      .where(eq(teamMembers.userId, userId)),
  ]);
  if (!u) return null;
  // 탈퇴 계정은 어떤 경로로도 살아나지 않는다. 탈퇴 시 session_version 을 올려 토큰을
  // 무효화하지만, 그건 "지금 발급된 토큰"만 막는다 — 여기서 한 번 더 못 박는다.
  if (u.withdrawnAt) return null;
  // "모든 기기에서 로그아웃" 이후 발급된 토큰만 통과한다.
  if (sessionVersion !== undefined && sessionVersion !== u.sessionVersion) return null;
  // 여기까지 왔다는 것은 "이 사람이 지금 로그인 상태로 사이트를 쓰고 있다"는 뜻이다 —
  // 멤버십 자동 만료의 기준이 되는 활동 흔적을 여기서 남긴다(필수원칙 #2).
  await touchLastSeen(db, userId, u.lastSeenAt);

  let role: Role = 'member';
  for (const r of ms) if (ROLE_RANK[r.role] > ROLE_RANK[role]) role = r.role;
  // 비활성 팀은 권한도 접힌 것으로 본다 — 팀을 비활성화해도 team_members 행은 남기 때문에,
  // 플래그만 보면 해체한 팀이 공고 편집 권한을 계속 들고 있게 된다.
  const teams: ActorTeam[] = tms.map((t) => ({
    teamId: t.teamId,
    position: t.position,
    canEditNotice: t.canEditNotice && t.teamActive,
  }));
  return { userId, name: u.name, role, membershipActive: ms.length > 0, teams };
}

/** 활동 흔적을 하루에 한 번만 갱신한다. 이 값의 해상도는 '일' 이면 충분하다. */
export const LAST_SEEN_TOUCH_INTERVAL_MS = 24 * 3600 * 1000;

/**
 * `users.last_seen_at` 갱신. **하루가 지났을 때만 쓴다.**
 *
 * 요청마다 UPDATE 하면 로그인 상태의 모든 화면에 쓰기 왕복이 하나씩 붙는다 — 이 함수가 있는
 * loadActor 는 페이지 HTML 과 그 화면이 부르는 API 가 각각 지나는 길목이라 비용이 곱으로 얹힌다.
 * 만료 기준이 '1년' 이라 하루 오차는 아무 의미가 없으므로, 하루에 한 번이면 충분하다.
 *
 * 실패해도 조용히 넘어간다 — 활동 기록을 못 남긴 것 때문에 로그인 자체가 막히면 안 된다.
 * 다음 요청에서 다시 시도하고, 그동안 값은 어제 것으로 남아 있을 뿐이다.
 */
async function touchLastSeen(db: DB, userId: string, lastSeenAt: Date | null): Promise<void> {
  const now = Date.now();
  if (lastSeenAt && now - lastSeenAt.getTime() < LAST_SEEN_TOUCH_INTERVAL_MS) return;
  try {
    await db.update(users).set({ lastSeenAt: new Date(now) }).where(eq(users.id, userId));
  } catch (e) {
    console.error('[auth] last_seen_at 갱신 실패(무시하고 계속)', e);
  }
}
