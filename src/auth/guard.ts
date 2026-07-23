// 서버 측 권한 가드 — 라우트 핸들러에서 쓰기 전에 호출한다.
// authorize(순수) 결과로 거부 시 403 을 던지고, 관리 행위/override 는 audit 에 기록한다.

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@/db/schema';
import { authorize, type Actor, type Action, type Decision, type DenyReason } from './permissions';
import { buildAuditEntry, recordAudit } from './audit';

/** 권한 거부. API Route 에서 403 으로 매핑한다. */
export class PermissionError extends Error {
  readonly status = 403;
  constructor(readonly reason: DenyReason) {
    super(`permission denied: ${reason}`);
    this.name = 'PermissionError';
  }
}

/** 허용이면 Decision(override 포함) 반환, 거부면 PermissionError throw. */
export function requireAuthorized(actor: Actor, action: Action): Decision {
  const decision = authorize(actor, action);
  if (!decision.allowed) throw new PermissionError(decision.reason as DenyReason);
  return decision;
}

/** 관리 행위(회장단 전용)는 항상 audit 대상. 그 외는 override 시에만 이 함수가 기록. */
export function isManagementAction(action: Action): boolean {
  switch (action.kind) {
    case 'membership.manage':
    case 'term.transition':
    case 'board.registry':
    case 'bot.token':
      return true;
    default:
      return false;
  }
}

export interface AuditTarget {
  table: string;
  id?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * 권한 검사 + (필요 시) audit 기록을 한 번에. 관리 행위 또는 소유권 override 인 경우 기록한다.
 * 게시물/문서의 상세 before→after 비교 감사는 도메인 핸들러가 target 으로 넘긴다.
 */
export async function guardWrite(
  db: PostgresJsDatabase<typeof schema>,
  actor: Actor,
  action: Action,
  target?: AuditTarget
): Promise<Decision> {
  const decision = requireAuthorized(actor, action);
  if (isManagementAction(action) || decision.override) {
    await recordAudit(
      db,
      buildAuditEntry({
        actorUserId: actor.userId,
        action: action.kind,
        targetTable: target?.table ?? action.kind,
        targetId: target?.id ?? null,
        before: target?.before,
        after: target?.after,
        override: decision.override,
      })
    );
  }
  return decision;
}
