// 학기 가입코드 — 활성 코드 항상 1개. 재발급 = 기존 비활성화 + 신규 발급(트랜잭션) + audit. 회장단 전용.

import { eq } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import { joinCodes } from '@/db/schema';
import type { Db, Database } from '@/db/types';
import type { Actor } from '@/auth/permissions';
import { requireAuthorized } from '@/auth/guard';
import { buildAuditEntry, recordAudit } from '@/auth/audit';

export type JoinCode = typeof joinCodes.$inferSelect;

// 혼동되는 문자(0/O, 1/I) 제외한 코드 알파벳.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateJoinCode(length = 8): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(0, ALPHABET.length)];
  return out;
}

export async function getActiveJoinCode(db: Database): Promise<JoinCode | null> {
  const [row] = await db.select().from(joinCodes).where(eq(joinCodes.isActive, true)).limit(1);
  return row ?? null;
}

/** 가입 시 코드 유효성 검사(활성 코드와 일치). 대소문자 무시. */
export async function validateJoinCode(db: Database, code: string): Promise<boolean> {
  const active = await getActiveJoinCode(db);
  return active != null && active.code.toUpperCase() === code.trim().toUpperCase();
}

export interface IssueArgs {
  semesterLabel: string;
  code?: string; // 미지정 시 자동 생성
}

/** 가입코드 발급/재발급(회장단 전용). 기존 활성 코드는 비활성화. */
export async function issueJoinCode(db: Db, actor: Actor, args: IssueArgs): Promise<JoinCode> {
  requireAuthorized(actor, { kind: 'joincode.manage' });
  const code = (args.code ?? generateJoinCode()).toUpperCase();

  return db.transaction(async (tx) => {
    const prev = await getActiveJoinCode(tx);
    if (prev) {
      await tx.update(joinCodes).set({ isActive: false }).where(eq(joinCodes.id, prev.id));
    }
    const [row] = await tx
      .insert(joinCodes)
      .values({ code, semesterLabel: args.semesterLabel, isActive: true, createdBy: actor.userId })
      .returning();
    await recordAudit(
      tx,
      buildAuditEntry({
        actorUserId: actor.userId,
        action: 'joincode.issue',
        targetTable: 'join_codes',
        targetId: row!.id,
        before: prev ? { code: prev.code, semesterLabel: prev.semesterLabel } : null,
        after: { code: row!.code, semesterLabel: row!.semesterLabel },
      })
    );
    return row!;
  });
}
