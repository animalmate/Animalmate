// 감사 로그 — 모든 관리 행위/override 를 audit_logs 에 기록(규칙 #4, 03 접근 규칙 2).
// buildAuditEntry 는 순수(테스트 가능), recordAudit 는 얇은 DB 삽입(db 를 주입받아 테스트 용이).

import { auditLogs } from '@/db/schema';
import type { Database } from '@/db/types';

export interface AuditInput {
  actorUserId: string | null;
  action: string;
  targetTable: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  /** 회장단/시스템관리자가 소유권을 우회한 경우 true → action 에 [override] 표기(규칙). */
  override?: boolean;
  /**
   * 눈에 띄어야 하는 행위 → action 에 [high] 표기.
   * 회장단 대상 권한 변경처럼 "상호 신뢰 전제이지만 사후에 반드시 보여야 하는" 행위에 쓴다
   * (상호 견제를 코드 차단이 아니라 가시성으로 해결한다 — 2026-07-24 결정).
   */
  severity?: 'high';
}

export interface AuditEntry {
  actorUserId: string | null;
  action: string;
  targetTable: string;
  targetId: string | null;
  beforeJson: unknown;
  afterJson: unknown;
}

/** audit_logs 삽입용 레코드를 만든다(누가/무엇을/이전값→새값). */
export function buildAuditEntry(input: AuditInput): AuditEntry {
  const marks = [input.override ? '[override]' : '', input.severity === 'high' ? '[high]' : '']
    .filter(Boolean)
    .join(' ');
  return {
    actorUserId: input.actorUserId,
    action: marks ? `${input.action} ${marks}` : input.action,
    targetTable: input.targetTable,
    targetId: input.targetId ?? null,
    beforeJson: input.before ?? null,
    afterJson: input.after ?? null,
  };
}

/** 감사 로그 1건 기록. db 는 일반 연결 또는 트랜잭션(tx). */
export async function recordAudit(db: Database, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values(entry);
}
