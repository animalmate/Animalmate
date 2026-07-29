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
import { TEST_DATABASE_URL } from './db-url';
import { GEMINI_READY } from './gemini-env';

// 키만 보면 부족하다 — 모델 ID 가 없으면 src/rag/gemini.ts 가 던진다. CI 에서는
// 설정이 없으면 skip 이 아니라 하드 실패한다(gemini-env.ts 주석 참고).
const suite = GEMINI_READY ? describe : describe.skip;

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
    sql = postgres(TEST_DATABASE_URL, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup();
    const [u] = await db.insert(users).values({ email: EMAIL, name: '정답오너' }).returning();
    owner = { userId: u!.id, role: 'member', membershipActive: true, teams: [] };
    // ⚠ 픽스처 사실은 **다른 문서와 겹칠 수 없는 고유한 것**이어야 한다.
    // 예전 "회비 2만원" 픽스처는 사용자가 실제로 올린 회비 문서(연 5만원)와 함께 검색되어
    // 모델이 실 문서로 답했고 테스트만 실패했다(챗봇은 정상이었다). 대상이 테스트 DB 로
    // 분리된 지금도 조건은 같다 — 복원 리허설처럼 테스트 DB 에 실 문서가 들어오는 순간이
    // 있고, RAG 는 "그 주제의 문서가 하나뿐"이라는 가정 위에서만 결정적이다.
    const doc = await createDocument(db, { ...owner, role: 'board' }, {
      title: `${PREFIX}물떼새프로젝트안내`,
      contentMd:
        '## 물떼새 프로젝트\n물떼새 프로젝트 정기 점검은 매월 셋째 주 수요일 오후 4시 20분에 진행합니다. 담당은 기획팀입니다.',
      visibility: 'member',
      ownerType: 'personal',
      ownerId: owner.userId,
    });
    docId = doc.id;
    // 짧은 질문이 컷오프에 걸려 헛핸드오프하던 회귀 방지용 문서.
    // 여기도 실 OT 문서와 겹치지 않도록 픽스처 고유 명칭을 쓴다(질문은 짧게 유지 — 그게 회귀 조건).
    await createDocument(db, { ...owner, role: 'board' }, {
      title: `${PREFIX}물떼새신입안내`,
      contentMd:
        '## 물떼새 OT\n물떼새 OT 는 3월 8일 토요일 오후 2시 학생회관 201호에서 진행합니다. 전원 참석입니다.',
      visibility: 'member',
      ownerType: 'personal',
      ownerId: owner.userId,
    });
  });

  afterAll(async () => {
    await deleteDocument(db, { ...owner, role: 'board' }, docId).catch(() => {});
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  it('심은 문서의 사실로 답하고 출처를 표시한다', async () => {
    const res = await askChatbot(db, owner, '물떼새 프로젝트 정기 점검은 언제인가요?');
    expect(res.handedOff).toBe(false);
    expect(res.answer).toMatch(/셋째|수요일|4\s*시\s*20|16:20/); // 문서의 사실
    expect(res.sources.some((s) => s.includes('물떼새프로젝트안내'))).toBe(true);
  }, 60_000);

  it('짧은 질문도 자료가 있으면 답한다(컷오프 헛핸드오프 회귀 방지)', async () => {
    const res = await askChatbot(db, owner, '물떼새 OT 언제야?');
    expect(res.handedOff).toBe(false);
    expect(res.answer).toMatch(/3월\s*8|학생회관|오후\s*2/); // OT 문서의 사실
  }, 60_000);

  it('심은 문서와 무관한 질문은 지어내지 않고 핸드오프한다', async () => {
    const res = await askChatbot(db, owner, '동아리 티셔츠는 무슨 색인가요?');
    expect(res.handedOff).toBe(true);
    expect(res.sources).toEqual([]); // 핸드오프면 출처 없음
  }, 60_000);
});
