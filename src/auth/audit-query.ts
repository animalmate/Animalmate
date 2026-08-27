// 감사 기록 조회 — 회장단 화면(`/admin/audit`)이 쓰는 읽기 전용 서비스.
//
// 왜 필요했나: 규칙 #4 는 모든 관리 행위를 남기라고 하고 실제로 잘 남고 있다(2026-08-28 기준
// 12,988건). 그런데 **읽을 방법이 `psql` 뿐이었다.** 사고를 조사해야 하는 사람(회장단)과
// 읽을 수 있는 사람(개발자)이 달라서, 기록은 있는데 아무도 못 보는 상태였다.
// `11-INCIDENT-RESPONSE.md` 가 "감사 기록(`membership.expire`)을 확인하라"고 적어 둔 절차도
// 실제로는 실행할 수 없었다.
//
// ⚠ **기본은 사람이 한 일만 보여 준다.** 전체의 87%(11,324건)가 `cron.publish` 라, 그대로 열면
// 크론 요약이 화면을 덮어 정작 찾는 것이 보이지 않는다. 자동 작업은 스위치로 켜서 본다.

import { and, count, desc, eq, gte, lt, not, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '@/db/types';
import { auditLogs, users } from '@/db/schema';
import { encodeCursor, parseCursor } from './audit-view';

export interface AuditFilters {
  /** 대분류(`AUDIT_GROUPS` 의 key). 없으면 전체. */
  group?: string;
  /** `[high]` 만 보기 — 사후에 반드시 봐야 하는 행위들. */
  highOnly?: boolean;
  /** 자동 작업(cron·batch)을 함께 볼지. 기본 false. */
  includeAutomated?: boolean;
  /** 최근 N일. 0 이나 미지정이면 전체 기간. */
  days?: number;
  /** 특정 행위자만. */
  actorUserId?: string;
  /** 이어보기 커서(`encodeCursor`). */
  cursor?: string | null;
  limit?: number;
}

export interface AuditRow {
  id: string;
  at: string;
  action: string;
  targetTable: string;
  targetId: string | null;
  before: unknown;
  after: unknown;
  actorUserId: string | null;
  /** 탈퇴 계정은 이름이 지워진다 — 그때는 null 로 내려 화면이 '탈퇴한 회원'으로 적는다. */
  actorName: string | null;
}

export interface AuditPage {
  rows: AuditRow[];
  /** 같은 필터의 전체 건수(이어보기와 무관). "무엇을 보고 있는지" 를 알려 준다. */
  total: number;
  nextCursor: string | null;
}

export const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** `cron.%`·`batch.%` 를 빼는 조건. 마크(`[high]`)가 뒤에 붙으므로 접두사로만 판단한다. */
const automatedFilter = (): SQL => or(sql`${auditLogs.action} like 'cron.%'`, sql`${auditLogs.action} like 'batch.%'`)!;

function buildWhere(f: AuditFilters): SQL | undefined {
  const parts: SQL[] = [];

  if (!f.includeAutomated) parts.push(not(automatedFilter()));
  // 대분류는 접두사로 좁힌다. `recruit` 를 고르면 `recruit.applicant.*` 까지 전부 들어온다.
  if (f.group) parts.push(sql`${auditLogs.action} like ${f.group + '.%'}`);
  if (f.highOnly) parts.push(sql`${auditLogs.action} like '%[high]%'`);
  if (f.actorUserId) parts.push(eq(auditLogs.actorUserId, f.actorUserId));
  if (f.days && f.days > 0) {
    parts.push(gte(auditLogs.createdAt, new Date(Date.now() - f.days * 24 * 60 * 60 * 1000)));
  }

  const cur = parseCursor(f.cursor);
  if (cur) {
    // (시각, id) 순서쌍으로 자른다 — 같은 시각 기록이 여러 건일 때 경계에서 빠지거나 겹치지 않는다.
    parts.push(
      or(lt(auditLogs.createdAt, cur.at), and(eq(auditLogs.createdAt, cur.at), lt(auditLogs.id, cur.id)))!
    );
  }

  return parts.length === 0 ? undefined : and(...parts);
}

export async function listAuditLogs(db: Db, filters: AuditFilters = {}): Promise<AuditPage> {
  const limit = Math.min(Math.max(1, filters.limit ?? DEFAULT_LIMIT), MAX_LIMIT);

  const rows = await db
    .select({
      id: auditLogs.id,
      at: auditLogs.createdAt,
      action: auditLogs.action,
      targetTable: auditLogs.targetTable,
      targetId: auditLogs.targetId,
      before: auditLogs.beforeJson,
      after: auditLogs.afterJson,
      actorUserId: auditLogs.actorUserId,
      actorName: users.name,
      withdrawnAt: users.withdrawnAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(buildWhere(filters))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(limit + 1); // 한 건 더 읽어 "다음이 있는지" 를 판단한다(별도 count 없이)

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];

  // 전체 건수는 커서를 뺀 같은 필터로 센다 — 이어볼수록 숫자가 줄어들면 안 된다.
  const [totalRow] = await db
    .select({ value: count() })
    .from(auditLogs)
    .where(buildWhere({ ...filters, cursor: null }));

  return {
    rows: page.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      action: r.action,
      targetTable: r.targetTable,
      targetId: r.targetId,
      before: r.before,
      after: r.after,
      actorUserId: r.actorUserId,
      actorName: r.withdrawnAt ? null : r.actorName,
    })),
    total: totalRow?.value ?? 0,
    nextCursor: rows.length > limit && last ? encodeCursor(last.at, last.id) : null,
  };
}

/**
 * 필터 드롭다운에 채울 행위자 목록 — **기록을 남긴 적이 있는 사람만.**
 * 전 회원을 나열하면 300명짜리 셀렉트가 되고, 그중 기록이 있는 사람은 17명뿐이다.
 */
export async function listAuditActors(db: Db): Promise<{ id: string; name: string }[]> {
  const rows = await db
    .selectDistinct({ id: users.id, name: users.name, withdrawnAt: users.withdrawnAt })
    .from(auditLogs)
    .innerJoin(users, eq(users.id, auditLogs.actorUserId))
    .orderBy(users.name);
  return rows.map((r) => ({ id: r.id, name: r.withdrawnAt ? '탈퇴한 회원' : r.name }));
}
