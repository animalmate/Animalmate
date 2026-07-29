// 챗봇 대화 기록 — 본인 것 조회(GET) / 초기화(DELETE).
// 로그인 사용자 전용이며 언제나 **자기 기록만** 다룬다(actor.userId 로만 조회·갱신).

import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { listChatHistory, clearChatHistory } from '@/rag/history';
import { internalError } from '@/http/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ history: await listChatHistory(db, actor) });
  } catch (e) {
    return internalError('GET /api/chatbot/history', e);
  }
}

export async function DELETE(): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    // 경계 시각만 기록한다 — chat_logs 행은 남는다(쿼터 우회·감사 기록 손실 방지). history.ts 주석 참고.
    await clearChatHistory(db, actor);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return internalError('DELETE /api/chatbot/history', e);
  }
}
