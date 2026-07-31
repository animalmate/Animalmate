// 멤버십 자동 만료 — **1년 넘게 사이트에 안 들어온 계정**의 멤버십을 expired 로 내린다(필수원칙 #2).
//
// 왜 임기(term_end)가 아니라 활동 기준인가(2026-07-31 개정, 07-DECISIONS 82):
// 예전 규칙은 가입 시 183일짜리 임기를 박고 그게 지나면 강등하는 것이었다. 그런데 **임기를 연장하는
// 화면이 어디에도 없었다.** 그래서 아무도 손대지 않으면 전원이 동시에 강등되고, 그중에 유일한
// 회장단·시스템관리자가 섞여 있으면 콘솔에서 아무도 권한을 되돌릴 수 없다(실제로 그 상태였다).
// 활동을 기준으로 삼으면 **쓰는 사람은 저절로 갱신되고 안 쓰는 사람만 정리된다** — 사람 손이 필요 없다.
//
// 강등만으로는 부족하다 — 이미 로그인해 둔 브라우저는 쿠키가 살아 있다. 그래서 session_version 을
// 함께 올려 그 계정의 모든 기기 세션을 즉시 끊는다(결정 11·13 과 같은 방식).
//
// 크론은 시스템 행위라 actor 가 없다(actorUserId=null).

import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Db } from '@/db/types';
import { memberships, users } from '@/db/schema';
import { isPrivileged, type Role } from './permissions';
import { buildAuditEntry, recordAudit } from './audit';
import { privilegedAlertRecipients } from './operators';
import { defaultMailer, type Mailer } from './mailer';

/** 이 기간 넘게 안 들어오면 멤버십이 내려간다. */
export const INACTIVE_LIMIT_DAYS = 365;

const DAY_MS = 86_400_000;

/**
 * 마지막 활동이 기준을 넘겼는가(순수).
 *
 * `lastSeen` 이 없으면(옛 계정·마이그레이션 직후) **가입 시각**을 쓴다 — 한 번도 안 들어온 사람은
 * 가입한 날이 곧 마지막 활동이다. 둘 다 없는 경우는 판단 근거가 없으므로 **만료시키지 않는다**
 * (근거 없이 권한을 뺏는 쪽보다 남겨 두고 사람이 보는 쪽이 낫다).
 */
export function isInactive(
  lastSeen: Date | null,
  createdAt: Date | null,
  now: Date,
  limitDays: number = INACTIVE_LIMIT_DAYS
): boolean {
  const basis = lastSeen ?? createdAt;
  if (!basis) return false;
  return now.getTime() - basis.getTime() > limitDays * DAY_MS;
}

/**
 * 이번에 내릴 대상 중 **권한자를 빼야 하는가**(순수).
 *
 * 마지막 회장단·시스템관리자까지 내려가면 콘솔에서 아무도 권한을 되돌릴 수 없다 — 사람이 하는
 * 강등에는 이 보호가 여러 겹 있는데(members.ts 의 last_privileged·last_sysadmin) 자동 만료에는
 * 없었다. 1년이나 방치된 계정이라도, **잠긴 콘솔보다는 남아 있는 계정 하나가 낫다.**
 *
 * @param activePrivileged 지금 활성 권한자 수
 * @param lapsingPrivileged 이번에 내려갈 권한자 수
 */
export function wouldOrphanConsole(activePrivileged: number, lapsingPrivileged: number): boolean {
  return lapsingPrivileged > 0 && activePrivileged - lapsingPrivileged <= 0;
}

export interface InactivityExpirySummary {
  checkedAt: string;
  limitDays: number;
  /** expired 로 바뀐 멤버십 행 수. */
  expired: number;
  /** 세션을 끊은 사용자 수(한 사람이 멤버십을 여러 개 가질 수 있어 행 수와 다를 수 있다). */
  usersRevoked: number;
  /** 콘솔 잠금 방지로 **일부러 남긴** 권한자 멤버십 수. 0 이 아니면 사람이 확인해야 한다. */
  keptToAvoidLockout: number;
}

export interface ExpiryDeps {
  now?: Date;
  limitDays?: number;
  mailer?: Mailer;
  alertEmails?: () => Promise<string[]>;
}

/**
 * 1년 넘게 안 들어온 계정의 활성 멤버십을 expired 로 바꾸고 세션을 무효화한다.
 * 한 트랜잭션으로 처리한다 — 강등만 되고 세션이 남거나 그 반대가 되면 안 된다.
 */
export async function expireInactiveMemberships(
  db: Db,
  deps: ExpiryDeps = {}
): Promise<InactivityExpirySummary> {
  const now = deps.now ?? new Date();
  const limitDays = deps.limitDays ?? INACTIVE_LIMIT_DAYS;
  const summary: InactivityExpirySummary = {
    checkedAt: now.toISOString(),
    limitDays,
    expired: 0,
    usersRevoked: 0,
    keptToAvoidLockout: 0,
  };

  const cutoff = new Date(now.getTime() - limitDays * DAY_MS);

  // 탈퇴 계정은 이미 멤버십이 expired 라 걸리지 않지만, 명시적으로 제외해 의도를 드러낸다.
  const candidates = await db
    .select({
      membershipId: memberships.id,
      userId: memberships.userId,
      role: memberships.role,
      lastSeenAt: users.lastSeenAt,
      createdAt: users.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    // raw SQL 조각에는 Date 를 그대로 넘기지 않는다 — 드라이버가 타입 정보를 못 받아
    // "string argument must be of type string" 으로 죽는다. ISO 문자열 + 명시 캐스트로 넘긴다.
    .where(
      and(
        eq(memberships.status, 'active'),
        sql`coalesce(${users.lastSeenAt}, ${users.createdAt}) < ${cutoff.toISOString()}::timestamptz`
      )
    );

  const lapsed = candidates.filter((c) => isInactive(c.lastSeenAt, c.createdAt, now, limitDays));

  // 콘솔 잠금 방지 — 이번에 내리면 권한자가 0 이 되는지 본다.
  const [privRow] = await db
    .select({ n: sql<number>`count(distinct ${memberships.userId})::int` })
    .from(memberships)
    .where(and(eq(memberships.status, 'active'), inArray(memberships.role, ['board', 'sysadmin'])));
  const activePrivileged = privRow?.n ?? 0;
  const lapsingPrivilegedUsers = new Set(lapsed.filter((l) => isPrivileged(l.role as Role)).map((l) => l.userId));

  let toExpire = lapsed;
  if (wouldOrphanConsole(activePrivileged, lapsingPrivilegedUsers.size)) {
    toExpire = lapsed.filter((l) => !isPrivileged(l.role as Role));
    summary.keptToAvoidLockout = lapsed.length - toExpire.length;
  }

  if (toExpire.length === 0) {
    if (summary.keptToAvoidLockout > 0) await alertLockoutAvoided(db, summary, deps);
    await recordSummary(db, summary);
    return summary;
  }

  const ids = toExpire.map((m) => m.membershipId);
  const userIds = [...new Set(toExpire.map((m) => m.userId))];

  await db.transaction(async (tx) => {
    await tx.update(memberships).set({ status: 'expired' }).where(inArray(memberships.id, ids));

    // 이미 열려 있는 세션도 끊는다. 권한은 매 요청 DB 에서 읽지만, 세대 번호를 올려야
    // "만료된 계정이 로그인 상태로 화면을 돌아다니는" 상태가 남지 않는다.
    await tx
      .update(users)
      .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(and(inArray(users.id, userIds), isNotNull(users.id)));

    // 누구의 무엇이 언제 만료됐는지 사람 단위로 남긴다(규칙 #4). "왜 권한이 없어졌지"의 답이 된다.
    for (const m of toExpire) {
      await recordAudit(
        tx,
        buildAuditEntry({
          actorUserId: null,
          action: 'membership.expire',
          targetTable: 'memberships',
          targetId: m.userId,
          before: { role: m.role, status: 'active', lastSeenAt: (m.lastSeenAt ?? m.createdAt)?.toISOString() ?? null },
          after: { role: m.role, status: 'expired', reason: 'inactive', limitDays },
          // 권한이 사라지는 변화라 사후에 반드시 보여야 한다.
          severity: 'high',
        })
      );
    }
  });

  summary.expired = toExpire.length;
  summary.usersRevoked = userIds.length;

  if (summary.keptToAvoidLockout > 0) await alertLockoutAvoided(db, summary, deps);
  await recordSummary(db, summary);
  return summary;
}

/**
 * 마지막 권한자를 일부러 남겼다는 사실을 알린다.
 *
 * 조용히 넘어가면 "1년 방치된 계정이 유일한 관리자"라는 상태가 아무에게도 보이지 않는다 —
 * 그건 사람이 알고 조치해야 하는 상황이다(규칙 #5: 실패·이상을 조용히 삼키지 않는다).
 */
async function alertLockoutAvoided(db: Db, summary: InactivityExpirySummary, deps: ExpiryDeps): Promise<void> {
  try {
    const to = deps.alertEmails ? await deps.alertEmails() : await privilegedAlertRecipients(db);
    if (to.length === 0) return;
    const mailer = deps.mailer ?? defaultMailer();
    await mailer.send({
      to,
      subject: '[애니멀메이트] ⚠️ 마지막 관리자 계정이 장기 미접속입니다',
      text:
        `${summary.limitDays}일 넘게 접속하지 않은 회장단·시스템관리자 계정 ${summary.keptToAvoidLockout}건이\n` +
        `자동 만료 대상이었지만, 내리면 콘솔에서 아무도 권한을 되돌릴 수 없게 되어 **그대로 두었습니다.**\n\n` +
        `지금 활동 중인 분을 회장단으로 지정한 뒤, 쓰지 않는 계정을 정리해 주세요.\n` +
        `(회원·팀 관리 화면에서 역할을 바꿀 수 있습니다.)`,
    });
  } catch (e) {
    await recordAudit(
      db,
      buildAuditEntry({
        actorUserId: null,
        action: 'cron.inactivity_expiry.alert_failed',
        targetTable: 'memberships',
        targetId: null,
        after: { error: e instanceof Error ? e.message : String(e) },
        severity: 'high',
      })
    );
  }
}

async function recordSummary(db: Db, summary: InactivityExpirySummary): Promise<void> {
  // 할 일이 없던 날은 남기지 않는다 — 매일 도는 잡이라 빈 요약을 쌓으면 감사 기록이 묻힌다(결정 63).
  if (summary.expired === 0 && summary.keptToAvoidLockout === 0) return;
  await recordAudit(
    db,
    buildAuditEntry({
      actorUserId: null,
      action: 'cron.inactivity_expiry',
      targetTable: 'memberships',
      targetId: null,
      after: summary,
    })
  );
}
