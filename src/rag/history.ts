// 챗봇 대화 기록 — 계정별 복원 + 초기화.
//
// 왜 필요한가: 챗봇을 쓰다 나갔다 들어오면 화면이 비어 있어서, 이미 답을 받은 질문을 다시 물어야
// 했다(2026-07-29 QA). 그런데 `chat_logs` 에는 계정별 질문·답변·출처가 이미 전부 남아 있다 —
// 새로 저장할 것은 없고, 읽어서 되살리기만 하면 된다.
//
// ⚠ **이 기록을 모델에게 보내지 않는다.** 이전 대화를 프롬프트에 실으면 매 턴 입력 토큰이 늘어
// 오히려 API 비용이 커진다. 여기서 만드는 것은 **화면 복원용**이다(같은 질문 재입력이 줄어드는
// 절감 효과는 그대로 남는다).

import { and, desc, eq, gt, sql } from 'drizzle-orm';
import type { Db } from '@/db/types';
import { chatLogs, users } from '@/db/schema';
import type { Actor } from '@/auth/permissions';

/** 한 번에 복원할 최대 대화 수(질문+답변 쌍). 오래된 것부터 잘라 화면·payload 를 제한한다. */
export const HISTORY_LIMIT = 50;

export interface ChatHistoryItem {
  question: string;
  answer: string;
  sources: string[];
  handedOff: boolean;
  createdAt: string;
}

/**
 * 로그인 사용자의 대화 기록(초기화 경계 이후만), 오래된 순.
 *
 * 본인 것만 읽는다 — `userId` 로만 조회하므로 다른 사람 대화가 섞일 수 없다.
 */
export async function listChatHistory(db: Db, actor: Actor, limit = HISTORY_LIMIT): Promise<ChatHistoryItem[]> {
  const [u] = await db
    .select({ clearedAt: users.chatClearedAt })
    .from(users)
    .where(eq(users.id, actor.userId))
    .limit(1);

  const mine = eq(chatLogs.userId, actor.userId);
  const where = u?.clearedAt ? and(mine, gt(chatLogs.createdAt, u.clearedAt)) : mine;

  // 최근 것부터 limit 만큼 고른 뒤 다시 오래된 순으로 뒤집는다
  // (오래된 순으로 자르면 대화가 길어졌을 때 **최근 대화가 잘려 나간다**).
  const rows = await db
    .select({
      question: chatLogs.question,
      answer: chatLogs.answer,
      sources: chatLogs.sources,
      handedOff: chatLogs.handedOff,
      createdAt: chatLogs.createdAt,
    })
    .from(chatLogs)
    .where(where)
    .orderBy(desc(chatLogs.createdAt))
    .limit(limit);

  return rows
    .map((r) => ({
      question: r.question,
      answer: r.answer,
      // 핸드오프한 답변에는 출처를 붙이지 않는다(규칙 #7) — 저장 시점 값을 그대로 존중한다.
      sources: r.handedOff ? [] : (r.sources ?? []),
      handedOff: r.handedOff,
      createdAt: r.createdAt.toISOString(),
    }))
    .reverse();
}

/**
 * 대화 초기화 — **경계 시각만 기록하고 chat_logs 행은 지우지 않는다.**
 *
 * 지우면 안 되는 이유: `quota.ts` 가 chat_logs 행 수로 인당 일일 사용량을 센다. 삭제식 초기화라면
 * 버튼 한 번으로 일일 상한(기본 30건)을 무한히 우회할 수 있다. 감사 기록과 챗봇 평가 데이터도
 * 함께 사라진다. 화면에서 사라지는 것으로 충분하다.
 */
export async function clearChatHistory(db: Db, actor: Actor): Promise<void> {
  // ⚠ 경계는 **DB 시계**로 찍는다. 비교 대상인 chat_logs.created_at 이 DB 의 now() 이므로,
  //    앱에서 new Date() 로 찍으면 두 시계가 어긋난 만큼 오차가 생긴다. 앱 시계가 조금이라도
  //    빠르면 **초기화 직후 보낸 메시지가 경계보다 과거로 판정되어 화면에서 사라진다**
  //    (2026-07-29 테스트로 발견 — Vercel 과 Supabase 는 서로 다른 호스트다).
  await db.update(users).set({ chatClearedAt: sql`now()` }).where(eq(users.id, actor.userId));
}
