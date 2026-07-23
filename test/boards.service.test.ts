import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { boards, users, auditLogs } from '@/db/schema';
import {
  listBoards,
  getBoard,
  createBoard,
  updateBoard,
  deleteBoard,
} from '@/boards/service';
import { PermissionError } from '@/auth/guard';
import type { Actor } from '@/auth/permissions';

// 실제 Supabase 대상 통합 테스트. env 없으면 건너뜀(CI 는 시크릿 주입).
const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const suite = DIRECT_URL ? describe : describe.skip;

// 실제 게시판(예: 68)과 겹치지 않는 테스트 전용 menuid.
const TEST_MENUID = 990068;
const TEST_EMAIL = 'boards-service-test@example.invalid';

suite('boards 서비스 — CRUD + 권한 + audit', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let boardActor: Actor;
  let memberActor: Actor;

  async function cleanup() {
    await db.delete(auditLogs).where(eq(auditLogs.targetId, String(TEST_MENUID)));
    await db.delete(boards).where(eq(boards.menuid, TEST_MENUID));
    await db.delete(users).where(eq(users.email, TEST_EMAIL));
  }

  beforeAll(async () => {
    sql = postgres(DIRECT_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup(); // 이전 실패 잔여 제거
    // audit_logs.actor_user_id 는 users FK → 실제 사용자 1명 필요.
    const [u] = await db
      .insert(users)
      .values({ email: TEST_EMAIL, name: '보드테스트' })
      .returning();
    boardActor = { userId: u!.id, role: 'board', membershipActive: true, teams: [] };
    memberActor = { userId: u!.id, role: 'member', membershipActive: true, teams: [] };
  });

  afterAll(async () => {
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  it('부원(member)은 게시판 생성 불가 → PermissionError, 행·audit 미생성', async () => {
    await expect(
      createBoard(db, memberActor, { menuid: TEST_MENUID, name: '불가' })
    ).rejects.toBeInstanceOf(PermissionError);
    expect(await getBoard(db, TEST_MENUID)).toBeNull();
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.targetId, String(TEST_MENUID)));
    expect(audits).toHaveLength(0);
  });

  it('회장단(board)은 게시판 생성 + audit(board.create) 기록', async () => {
    const row = await createBoard(db, boardActor, {
      menuid: TEST_MENUID,
      name: '테스트 게시판',
      purpose: '검증용',
      botCanWrite: true,
    });
    expect(row).toMatchObject({ menuid: TEST_MENUID, name: '테스트 게시판', botCanWrite: true, isActive: true });

    const audits = await db.select().from(auditLogs).where(eq(auditLogs.targetId, String(TEST_MENUID)));
    expect(audits.some((a) => a.action === 'board.create')).toBe(true);
  });

  it('수정: 이름·bot_can_write 변경 + audit(board.update)', async () => {
    const row = await updateBoard(db, boardActor, TEST_MENUID, { name: '이름변경', botCanWrite: false });
    expect(row).toMatchObject({ name: '이름변경', botCanWrite: false });
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.targetId, String(TEST_MENUID)));
    expect(audits.some((a) => a.action === 'board.update')).toBe(true);
  });

  it('부원은 수정도 불가(PermissionError)', async () => {
    await expect(
      updateBoard(db, memberActor, TEST_MENUID, { name: '해킹' })
    ).rejects.toBeInstanceOf(PermissionError);
    expect((await getBoard(db, TEST_MENUID))?.name).toBe('이름변경');
  });

  it('삭제 = 소프트 삭제(is_active=false) + audit(board.delete)', async () => {
    const row = await deleteBoard(db, boardActor, TEST_MENUID);
    expect(row.isActive).toBe(false);
    // 행은 남아 있어야 함(하드 삭제 아님).
    expect(await getBoard(db, TEST_MENUID)).not.toBeNull();
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.targetId, String(TEST_MENUID)));
    expect(audits.some((a) => a.action === 'board.delete')).toBe(true);
  });

  it('listBoards activeOnly=true 는 비활성 게시판을 제외', async () => {
    const all = await listBoards(db);
    const activeOnly = await listBoards(db, { activeOnly: true });
    expect(all.some((b) => b.menuid === TEST_MENUID)).toBe(true); // 전체엔 있음(비활성)
    expect(activeOnly.some((b) => b.menuid === TEST_MENUID)).toBe(false); // 활성만엔 없음
  });
});
