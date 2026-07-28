// 임기 자동 만료 — term_end 가 지난 멤버십을 expired 로 강등한다(CLAUDE.md 필수원칙 #2).
//
// 왜 이제야 만드는가: 규칙과 03-DATA-MODEL·schema.ts 주석이 "크론이 매일 강등한다"고 적어 두었지만
// 실제로 term_end 를 읽는 코드가 하나도 없었다(2026-07-28 현황 점검에서 발견). 임기가 끝난
// 운영진의 권한이 스스로 사라지지 않고, 사람이 비활성화해 줄 때까지 남아 있었다.
//
// 강등만으로는 부족하다 — 이미 로그인해 둔 브라우저는 쿠키가 살아 있다. 그래서 session_version 을
// 함께 올려 그 계정의 모든 기기 세션을 즉시 끊는다(결정 11·13 과 같은 방식).
//
// 크론은 시스템 행위라 actor 가 없다(actorUserId=null).

import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Db } from '@/db/types';
import { memberships, users } from '@/db/schema';
import { buildAuditEntry, recordAudit } from './audit';

const KST_MS = 9 * 3600 * 1000;

/**
 * KST 기준 오늘 날짜(YYYY-MM-DD). term_end 는 date 타입이라 문자열로 비교한다.
 * UTC 로 계산하면 한국 시간 09:00 이전에 하루 밀린 날짜로 판단한다.
 */
export function kstToday(now: Date): string {
  return new Date(now.getTime() + KST_MS).toISOString().slice(0, 10);
}

/**
 * 임기가 지났는가(순수). 마지막 날은 아직 유효 — term_end === today 는 만료가 아니다.
 * "2026-08-31 까지"라고 적었으면 그날 하루는 쓸 수 있어야 한다.
 */
export function isTermLapsed(termEnd: string, today: string): boolean {
  return termEnd < today;
}

export interface TermExpirySummary {
  checkedAt: string;
  /** KST 기준 판정일. */
  today: string;
  /** expired 로 바뀐 멤버십 행 수. */
  expired: number;
  /** 세션을 끊은 사용자 수(한 사람이 멤버십을 여러 개 가질 수 있어 행 수와 다를 수 있다). */
  usersRevoked: number;
}

/**
 * term_end 가 지난 active 멤버십을 expired 로 바꾸고, 해당 사용자의 세션을 무효화한다.
 * 한 트랜잭션으로 처리한다 — 강등만 되고 세션이 남거나 그 반대가 되면 안 된다.
 */
export async function expireLapsedMemberships(db: Db, now: Date = new Date()): Promise<TermExpirySummary> {
  const today = kstToday(now);
  const summary: TermExpirySummary = {
    checkedAt: now.toISOString(),
    today,
    expired: 0,
    usersRevoked: 0,
  };

  const lapsed = await db
    .select({
      id: memberships.id,
      userId: memberships.userId,
      role: memberships.role,
      termEnd: memberships.termEnd,
    })
    .from(memberships)
    .where(and(eq(memberships.status, 'active'), lt(memberships.termEnd, today)));

  if (lapsed.length === 0) {
    await recordAudit(
      db,
      buildAuditEntry({
        actorUserId: null,
        action: 'cron.term_expiry',
        targetTable: 'memberships',
        targetId: null,
        after: summary,
      })
    );
    return summary;
  }

  const ids = lapsed.map((m) => m.id);
  const userIds = [...new Set(lapsed.map((m) => m.userId))];

  await db.transaction(async (tx) => {
    await tx.update(memberships).set({ status: 'expired' }).where(inArray(memberships.id, ids));

    // 이미 열려 있는 세션도 끊는다. 권한은 매 요청 DB 에서 읽지만, 세대 번호를 올려야
    // "만료된 계정이 로그인 상태로 화면을 돌아다니는" 상태가 남지 않는다.
    await tx
      .update(users)
      .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(inArray(users.id, userIds));

    // 누구의 무엇이 언제 만료됐는지 사람 단위로 남긴다(규칙 #4). 나중에 "왜 권한이 없어졌지"의 답이 된다.
    for (const m of lapsed) {
      await recordAudit(
        tx,
        buildAuditEntry({
          actorUserId: null,
          action: 'membership.expire',
          targetTable: 'memberships',
          targetId: m.userId,
          before: { role: m.role, status: 'active', termEnd: m.termEnd },
          after: { role: m.role, status: 'expired', reason: 'term_end_passed', today },
          // 권한이 사라지는 변화라 사후에 반드시 보여야 한다.
          severity: 'high',
        })
      );
    }
  });

  summary.expired = lapsed.length;
  summary.usersRevoked = userIds.length;

  await recordAudit(
    db,
    buildAuditEntry({
      actorUserId: null,
      action: 'cron.term_expiry',
      targetTable: 'memberships',
      targetId: null,
      after: summary,
    })
  );
  return summary;
}
