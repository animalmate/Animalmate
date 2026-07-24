// 챗봇 정답 경로(happy path) — 문서를 심고 실제로 그 내용으로 답하는지, 출처가 붙는지 검증한다.
// 실 DB + 실 Gemini(검색·생성). 문서 파이프라인 → 검색 → 생성 → 출처까지 한 줄로 태운다.

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, like, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { documents, users, auditLogs } from '@/db/schema';
import { createDocument, deleteDocument } from '@/rag/documents';
import { askChatbot } from '@/rag/chatbot';
import type { Actor } from '@/auth/permissions';

const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const suite = DIRECT_URL && process.env.GEMINI_API_KEY ? describe : describe.skip;

const PREFIX = 'CHATANSWER_';
const EMAIL = 'chatanswer@example.invalid';

suite('챗봇 정답 경로 — 심은 문서로 답하고 출처를 단다', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let owner: Actor;
  let docId: string;

  async function cleanup() {
    const docs = await db.select({ id: documents.id }).from(documents).where(like(documents.title, `${PREFIX}%`));
    const ids = docs.map((d) => d.id);
    if (ids.length) {
      await db.delete(auditLogs).where(inArray(auditLogs.targetId, ids));
      await db.delete(documents).where(inArray(documents.id, ids));
    }
    await db.delete(users).where(eq(users.email, EMAIL));
  }

  beforeAll(async () => {
    sql = postgres(DIRECT_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup();
    const [u] = await db.insert(users).values({ email: EMAIL, name: '정답오너' }).returning();
    owner = { userId: u!.id, role: 'member', membershipActive: true, teams: [] };
    const doc = await createDocument(db, { ...owner, role: 'board' }, {
      title: `${PREFIX}회비안내`,
      contentMd: '## 회비\n애니멀메이트 한 학기 회비는 2만원입니다. 신입 부원도 같습니다.',
      visibility: 'member',
      ownerType: 'personal',
      ownerId: owner.userId,
    });
    docId = doc.id;
  });

  afterAll(async () => {
    await deleteDocument(db, { ...owner, role: 'board' }, docId).catch(() => {});
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  it('부원이 회비를 물으면 문서 내용(2만원)으로 답하고 출처를 표시한다', async () => {
    const res = await askChatbot(db, owner, '회비 얼마예요?');
    expect(res.handedOff).toBe(false);
    expect(res.answer).toMatch(/2\s*만원|20,?000/); // 문서의 사실
    expect(res.sources.some((s) => s.includes('회비안내'))).toBe(true);
  }, 60_000);

  it('심은 문서와 무관한 질문은 지어내지 않고 핸드오프한다', async () => {
    const res = await askChatbot(db, owner, '동아리 티셔츠는 무슨 색인가요?');
    expect(res.handedOff).toBe(true);
  }, 60_000);
});
