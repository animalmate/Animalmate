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
