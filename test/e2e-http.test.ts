// 인증 필요 HTTP E2E — 실제 서버에 세션 쿠키를 들고 요청해 라우팅+인증 미들웨어+서비스+DB 전 과정을 검증.
// 실행: 서버 기동 후 `E2E_BASE_URL=http://localhost:PORT npm run test:e2e`.
// 세션 쿠키는 앱 자신의 signSession()으로 서명(테스트용 유저를 DB에 넣고, 그 세션으로 접근).
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { users, memberships, postTemplates, auditLogs } from '@/db/schema';
import { signSession, SESSION_COOKIE } from '@/auth/session';

const BASE = process.env.E2E_BASE_URL;
const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const SECRET = process.env.SESSION_SECRET;
const suite = BASE && DIRECT_URL && SECRET ? describe : describe.skip;

const BOARD_EMAIL = 'e2e-board@example.invalid';

suite('인증 필요 HTTP E2E (템플릿 CRUD · 입력검증 · 권한 게이트)', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let boardId: string;
  let cookie: string;
  const createdTemplateIds: string[] = [];

  const H = () => ({ 'Content-Type': 'application/json', Cookie: cookie });

  async function cleanup() {
    if (createdTemplateIds.length) {
      await db.delete(auditLogs).where(inArray(auditLogs.targetId, createdTemplateIds));
      await db.delete(postTemplates).where(inArray(postTemplates.id, createdTemplateIds));
    }
    const us = await db.select({ id: users.id }).from(users).where(eq(users.email, BOARD_EMAIL));
    for (const u of us) {
      await db.delete(auditLogs).where(eq(auditLogs.actorUserId, u.id));
      await db.delete(memberships).where(eq(memberships.userId, u.id));
      await db.delete(postTemplates).where(eq(postTemplates.ownerId, u.id));
      await db.delete(users).where(eq(users.id, u.id));
    }
  }

  beforeAll(async () => {
    sql = postgres(DIRECT_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup();
    const [b] = await db.insert(users).values({ email: BOARD_EMAIL, name: 'E2E회장' }).returning();
    boardId = b!.id;
    await db.insert(memberships).values({ userId: boardId, role: 'board', termStart: '2026-01-01', termEnd: '2030-01-01', status: 'active' });
    cookie = `${SESSION_COOKIE}=${signSession({ sub: boardId, role: 'board' }, SECRET!)}`;
  });

  afterAll(async () => {
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  it('쿠키 없이 GET /api/templates → 403', async () => {
    const res = await fetch(`${BASE}/api/templates`);
    expect(res.status).toBe(403);
  });

  it('회장단 쿠키로 GET /api/templates → 200', async () => {
    const res = await fetch(`${BASE}/api/templates`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.templates)).toBe(true);
  });

  it('POST /api/templates(개인) → 생성 후 목록에 나타남', async () => {
    const res = await fetch(`${BASE}/api/templates`, {
      method: 'POST',
      headers: H(),
      body: JSON.stringify({ ownerType: 'personal', name: 'E2E 양식', titleTemplate: '{{간결_날짜}} 공지', bodyTemplate: '본문' }),
    });
    expect(res.status).toBe(200);
    const { template } = await res.json();
    expect(template.name).toBe('E2E 양식');
    createdTemplateIds.push(template.id);

    const list = await (await fetch(`${BASE}/api/templates`, { headers: { Cookie: cookie } })).json();
    expect(list.templates.some((t: { id: string }) => t.id === template.id)).toBe(true);
  });

  it('POST /api/templates 이름 누락 → 400', async () => {
    const res = await fetch(`${BASE}/api/templates`, {
      method: 'POST',
      headers: H(),
      body: JSON.stringify({ ownerType: 'personal', name: '  ', titleTemplate: 'x', bodyTemplate: 'y' }),
    });
    expect(res.status).toBe(400);
  });

  it('PATCH → 이름 변경, DELETE → 목록에서 사라짐', async () => {
    const id = createdTemplateIds[0]!;
    const patch = await fetch(`${BASE}/api/templates/${id}`, { method: 'PATCH', headers: H(), body: JSON.stringify({ name: 'E2E 수정됨' }) });
    expect(patch.status).toBe(200);
    expect((await patch.json()).template.name).toBe('E2E 수정됨');

    const del = await fetch(`${BASE}/api/templates/${id}`, { method: 'DELETE', headers: { Cookie: cookie } });
    expect(del.status).toBe(200);
    const list = await (await fetch(`${BASE}/api/templates`, { headers: { Cookie: cookie } })).json();
    expect(list.templates.some((t: { id: string }) => t.id === id)).toBe(false);
    createdTemplateIds.shift();
  });
});
