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

// 직접 지정한 코드의 최소 형식. 회장단이 "2026" 처럼 짧고 뻔한 코드를 넣으면 가입이 사실상
// 누구에게나 열린다(가입코드는 신원 확인의 유일한 관문이다). 자동 생성 코드와 같은 문자셋·길이를 요구한다.
export const MIN_JOIN_CODE_LENGTH = 6;
export const MAX_JOIN_CODE_LENGTH = 32;

export class InvalidJoinCodeError extends Error {
  readonly status = 400;
  constructor() {
    super(`가입코드는 ${MIN_JOIN_CODE_LENGTH}자 이상이며 영문 대문자와 숫자만 쓸 수 있습니다.`);
    this.name = 'InvalidJoinCodeError';
  }
}

// 이미 한 번 쓰인 코드 값으로 다시 발급하려 할 때. 코드는 `code` 컬럼이 UNIQUE 라서
// 그냥 INSERT 하면 드라이버의 23505 가 라우트 catch 를 그대로 빠져나가 500 으로 나갔고,
// 화면에는 "오류가 발생했어요" 만 떠서 무엇이 잘못됐는지 알 수 없었다(2026-07-31 실제 발생).
export class DuplicateJoinCodeError extends Error {
  readonly status = 409;
  constructor() {
    super('이미 쓰인 가입코드입니다. 다른 코드를 넣거나, 코드 칸을 비워 자동 생성하세요.');
    this.name = 'DuplicateJoinCodeError';
  }
}

/** postgres 드라이버 오류가 join_codes.code 의 unique 위반인지. 순수 판별(테스트 가능). */
export function isDuplicateCodeError(e: unknown): boolean {
  const err = e as { code?: unknown; constraint_name?: unknown } | null;
  return err?.code === '23505' && err?.constraint_name === 'join_codes_code_unique';
}

/** 직접 지정한 가입코드를 정규화(대문자·공백 제거)하고 형식을 강제한다. */
export function normalizeJoinCode(raw: string): string {
  const code = raw.trim().toUpperCase();
  if (code.length < MIN_JOIN_CODE_LENGTH || code.length > MAX_JOIN_CODE_LENGTH) throw new InvalidJoinCodeError();
  if (!/^[A-Z0-9]+$/.test(code)) throw new InvalidJoinCodeError();
  return code;
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
  const code = args.code ? normalizeJoinCode(args.code) : generateJoinCode();

  return db.transaction(async (tx) => {
    // 직접 넣은 코드가 이미 쓰인 값이면 여기서 멈춘다. 지난 학기 코드를 그대로 다시 넣는 건
    // 흔한 조작이라, 실패했을 때 이유를 말해 줘야 한다.
    if (args.code) {
      const [dup] = await tx.select({ id: joinCodes.id }).from(joinCodes).where(eq(joinCodes.code, code)).limit(1);
      if (dup) throw new DuplicateJoinCodeError();
    }

    const prev = await getActiveJoinCode(tx);
    if (prev) {
      await tx.update(joinCodes).set({ isActive: false }).where(eq(joinCodes.id, prev.id));
    }
    const inserted = await tx
      .insert(joinCodes)
      .values({ code, semesterLabel: args.semesterLabel, isActive: true, createdBy: actor.userId })
      .returning()
      .catch((e: unknown) => {
        // 위 검사와 INSERT 사이의 경쟁(동시 발급). 사용자에게는 같은 이야기다.
        if (isDuplicateCodeError(e)) throw new DuplicateJoinCodeError();
        throw e;
      });
    const [row] = inserted;
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
