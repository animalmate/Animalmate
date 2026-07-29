// 챗봇 대화 기록 — 본인 것만 복원되는지, 초기화가 **행을 지우지 않는지** 검증한다.
//
// 초기화가 삭제였다면 quota.ts 가 chat_logs 행 수로 세는 일일 상한을 버튼 한 번으로 무한히
// 우회할 수 있다. 그래서 "초기화 후에도 행 수는 그대로"가 이 파일의 가장 중요한 단언이다.

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray, count } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { users, chatLogs } from '@/db/schema';
import { listChatHistory, clearChatHistory } from '@/rag/history';
import type { Actor } from '@/auth/permissions';
import { TEST_DATABASE_URL } from './db-url';

const ME = 'chat-history-me@example.invalid';
const OTHER = 'chat-history-other@example.invalid';

describe('챗봇 대화 기록 — 본인 것만, 초기화는 경계 시각만', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let myId: string;
  let otherId: string;
  let me: Actor;

  const log = async (userId: string, question: string, answer: string, handedOff = false, sources: string[] = []) => {
    await db.insert(chatLogs).values({ userId, roleAtTime: 'member', question, answer, sources, handedOff });
  };

  async function cleanup() {
    const us = await db.select({ id: users.id }).from(users).where(inArray(users.email, [ME, OTHER]));
    for (const u of us) {
      await db.delete(chatLogs).where(eq(chatLogs.userId, u.id));
      await db.delete(users).where(eq(users.id, u.id));
    }
  }

  beforeAll(async () => {
    sql = postgres(TEST_DATABASE_URL, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup();
    const [a] = await db.insert(users).values({ email: ME, name: '나' }).returning();
    const [b] = await db.insert(users).values({ email: OTHER, name: '남' }).returning();
    myId = a!.id;
    otherId = b!.id;
    me = { userId: myId, role: 'member', membershipActive: true, teams: [] };

    await log(myId, '회비 얼마?', '2만원이에요.', false, ['회비안내']);
    await log(myId, '모르는 질문', '제가 모르는 내용이에요.', true, ['회칙']); // 핸드오프인데 출처가 남아 있는 경우
    await log(otherId, '남의 질문', '남의 답변');
  });

  afterAll(async () => {
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  it('내 대화만 오래된 순으로 돌려준다(남의 대화는 섞이지 않는다)', async () => {
    const rows = await listChatHistory(db, me);
    expect(rows.map((r) => r.question)).toEqual(['회비 얼마?', '모르는 질문']);
  });

  it('핸드오프한 답변에는 출처를 붙이지 않는다(규칙 #7)', async () => {
    const rows = await listChatHistory(db, me);
    expect(rows[0]!.sources).toEqual(['회비안내']);
    expect(rows[1]!.sources).toEqual([]); // 저장된 값이 있어도 핸드오프면 비운다
  });

  it('초기화하면 화면에서는 비지만 **chat_logs 행은 그대로**다(쿼터 우회 방지)', async () => {
    const before = await db.select({ n: count() }).from(chatLogs).where(eq(chatLogs.userId, myId));
    await clearChatHistory(db, me);

    expect(await listChatHistory(db, me)).toEqual([]); // 화면에는 안 보인다
    const after = await db.select({ n: count() }).from(chatLogs).where(eq(chatLogs.userId, myId));
    expect(after[0]!.n).toBe(before[0]!.n); // 행은 남아 있다 = 일일 쿼터가 리셋되지 않는다
    expect(before[0]!.n).toBe(2);
  });

  it('초기화 이후의 새 대화는 다시 보인다', async () => {
    await log(myId, '초기화 뒤 질문', '초기화 뒤 답변');
    const rows = await listChatHistory(db, me);
    expect(rows.map((r) => r.question)).toEqual(['초기화 뒤 질문']);
  });

  it('남의 기록은 내 초기화에 영향받지 않는다', async () => {
    const other: Actor = { userId: otherId, role: 'member', membershipActive: true, teams: [] };
    expect((await listChatHistory(db, other)).map((r) => r.question)).toEqual(['남의 질문']);
  });
});
