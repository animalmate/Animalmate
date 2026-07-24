// 운영 알림 수신자 — 활성 회장단·시스템관리자 이메일.
// 팀장단(team_members)이 배정되지 않은 경우의 폴백 수신자이자, 발행 실패 등 시스템 알림의 기본 수신자.

import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db/types';
import { memberships, users } from '@/db/schema';

/** 활성 회장단·시스템관리자 이메일(중복 제거). 운영 알림/폴백 수신자. */
export async function boardEmails(db: Db): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.status, 'active'), inArray(memberships.role, ['board', 'sysadmin'])));
  return [...new Set(rows.map((r) => r.email))];
}

/** 동아리 공용 메일(SMTP 계정). 회장단 개인 계정과 별개로 기록이 남는 채널. */
export function sharedMailbox(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.SMTP_USER?.trim() || null;
}

/**
 * 회장단 권한 변경 알림 수신자 = 활성 회장단·시스템관리자 **전원**(행위자 본인 포함) + 공용 메일.
 *
 * 행위자를 빼지 않는 이유: 본인 계정이 탈취돼 남의 권한을 건드린 경우, 본인 메일함에 도착한
 * "내가 하지 않은 알림"이 가장 빠른 탐지 신호다.
 */
export async function privilegedAlertRecipients(db: Db): Promise<string[]> {
  const shared = sharedMailbox();
  return [...new Set([...(await boardEmails(db)), ...(shared ? [shared] : [])])];
}
