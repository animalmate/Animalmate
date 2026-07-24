// 게시판 레지스트리(boards) CRUD 서비스 — 회장단 전용 쓰기 + audit.
// 03: boards(menuid PK, name, purpose, bot_can_write, is_active). menuid 하드코딩 금지 — 여기서 관리.
//
// 설계:
//  - 쓰기(생성/수정/삭제)는 board.registry 권한(회장단·시스템관리자)만. requireAuthorized 로 강제 → 거부 시 403.
//  - 삭제는 하드 삭제 대신 is_active=false(소프트 삭제). scheduled_posts/recurring_rules FK·이력 보존.
//  - 모든 쓰기는 audit_logs 기록(누가/무엇을/이전값→새값).
//  - db 는 서버(service role) drizzle 인스턴스를 주입받는다(테스트 용이, RLS 우회는 서버 전용).
//  - 읽기는 시스템(발행 워커 등)도 쓰므로 actor 를 요구하지 않는다. 관리 UI 의 노출 제어는 라우트 계층에서.

import { eq, asc } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { boards } from '@/db/schema';
import type * as schema from '@/db/schema';
import type { Actor } from '@/auth/permissions';
import { requireAuthorized } from '@/auth/guard';
import { buildAuditEntry, recordAudit } from '@/auth/audit';

type DB = PostgresJsDatabase<typeof schema>;
export type Board = typeof boards.$inferSelect;

export interface CreateBoardInput {
  menuid: number;
  name: string;
  purpose?: string | null;
  botCanWrite?: boolean;
  isActive?: boolean;
}

export type UpdateBoardPatch = Partial<Omit<CreateBoardInput, 'menuid'>>;

/** 이미 등록된 menuid 로 생성 시도. 라우트에서 409 로 매핑. */
export class BoardExistsError extends Error {
  readonly status = 409;
  constructor(readonly menuid: number) {
    super(`board already exists: menuid=${menuid}`);
    this.name = 'BoardExistsError';
  }
}

const REGISTRY = { kind: 'board.registry' } as const;

/** 게시판 목록(기본: 전체, activeOnly=true 면 활성만). menuid 오름차순. */
export async function listBoards(db: DB, opts: { activeOnly?: boolean } = {}): Promise<Board[]> {
  const rows = await db.select().from(boards).orderBy(asc(boards.menuid));
  return opts.activeOnly ? rows.filter((b) => b.isActive) : rows;
}

/** 단건 조회(없으면 null). */
export async function getBoard(db: DB, menuid: number): Promise<Board | null> {
  const [row] = await db.select().from(boards).where(eq(boards.menuid, menuid)).limit(1);
  return row ?? null;
}

/**
 * 봇이 실제로 글을 써도 되는 게시판이면 그 행을, 아니면 null.
 * 조건 = 레지스트리에 등록 + is_active + bot_can_write.
 *
 * 왜 필요한가: boardMenuid 는 예약 생성 요청 본문에서 오고, FK 때문에 "등록된 게시판"까지만
 * 강제된다. 즉 운영진 계정 하나만 있으면 봇이 쓰면 안 되는 게시판(bot_can_write=false)이나
 * 폐지한 게시판(is_active=false)으로도 예약을 만들 수 있었다. 카페는 삭제 API 가 없어
 * 한번 나간 글은 되돌릴 수 없으므로, 등록 시점과 발행 직전 두 곳에서 모두 확인한다.
 */
export async function getWritableBoard(db: DB, menuid: number): Promise<Board | null> {
  const board = await getBoard(db, menuid);
  if (!board || !board.isActive || !board.botCanWrite) return null;
  return board;
}

/** 게시판 생성(회장단 전용). 권한 검사 → 삽입 → audit. */
export async function createBoard(db: DB, actor: Actor, input: CreateBoardInput): Promise<Board> {
  requireAuthorized(actor, REGISTRY);
  if (await getBoard(db, input.menuid)) throw new BoardExistsError(input.menuid);
  const [row] = await db
    .insert(boards)
    .values({
      menuid: input.menuid,
      name: input.name,
      purpose: input.purpose ?? null,
      botCanWrite: input.botCanWrite ?? false,
      isActive: input.isActive ?? true,
    })
    .returning();
  await recordAudit(
    db,
    buildAuditEntry({
      actorUserId: actor.userId,
      action: 'board.create',
      targetTable: 'boards',
      targetId: String(input.menuid),
      after: row,
    })
  );
  return row!;
}

/** 게시판 수정(회장단 전용). 이전값 조회 → 권한 검사 → 수정 → before→after audit. */
export async function updateBoard(
  db: DB,
  actor: Actor,
  menuid: number,
  patch: UpdateBoardPatch
): Promise<Board> {
  const before = await getBoard(db, menuid);
  if (!before) throw new Error(`board not found: menuid=${menuid}`);
  requireAuthorized(actor, REGISTRY);

  const [row] = await db
    .update(boards)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.purpose !== undefined ? { purpose: patch.purpose } : {}),
      ...(patch.botCanWrite !== undefined ? { botCanWrite: patch.botCanWrite } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
    })
    .where(eq(boards.menuid, menuid))
    .returning();
  await recordAudit(
    db,
    buildAuditEntry({
      actorUserId: actor.userId,
      action: 'board.update',
      targetTable: 'boards',
      targetId: String(menuid),
      before,
      after: row,
    })
  );
  return row!;
}

/**
 * 게시판 삭제(회장단 전용) = 소프트 삭제(is_active=false). 하드 삭제는 FK·이력 때문에 하지 않는다.
 */
export async function deleteBoard(db: DB, actor: Actor, menuid: number): Promise<Board> {
  const before = await getBoard(db, menuid);
  if (!before) throw new Error(`board not found: menuid=${menuid}`);
  requireAuthorized(actor, REGISTRY);

  const [row] = await db
    .update(boards)
    .set({ isActive: false })
    .where(eq(boards.menuid, menuid))
    .returning();
  await recordAudit(
    db,
    buildAuditEntry({
      actorUserId: actor.userId,
      action: 'board.delete',
      targetTable: 'boards',
      targetId: String(menuid),
      before,
      after: row,
    })
  );
  return row!;
}
