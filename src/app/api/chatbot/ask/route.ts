// 챗봇 질의 — 로그인 사용자 전용. 쿼터 확인 → 답변 생성 → chat_logs 기록.
// 쿼터가 곧 레이트 리밋이다(인당 일일 + 전역 분기). 근거 없으면 핸드오프.

import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { chatLogs } from '@/db/schema';
import { getCurrentActor } from '@/auth/current-user';
import { askChatbot } from '@/rag/chatbot';
import { checkQuota, type QuotaReason } from '@/rag/quota';
import { internalError } from '@/http/errors';
import { LIMITS, InputTooLongError, checkLength } from '@/http/input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QUOTA_MSG: Record<QuotaReason, string> = {
  disabled: '지금은 챗봇을 사용할 수 없어요. 잠시 후 다시 시도하거나 운영진에게 문의해 주세요.',
  daily_user: '오늘 사용할 수 있는 질문 수를 다 썼어요. 내일 다시 이용해 주세요.',
  global: '이번 분기 챗봇 사용량이 한도에 도달했어요. 운영진에게 문의해 주세요.',
};

export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 }); // 비로그인 차단(결정: 로그인 전용)
  try {
    const { question } = await req.json();
    const q = String(question ?? '').trim();
    if (!q) return NextResponse.json({ error: 'empty_question' }, { status: 400 });
    checkLength('질문', q, LIMITS.question);

    const quota = await checkQuota(db, actor);
    if (!quota.allowed) {
      return NextResponse.json({ error: 'quota', reason: quota.reason, message: QUOTA_MSG[quota.reason!] }, { status: 429 });
    }

    const result = await askChatbot(db, actor, q);

    // chat_logs 기록(쿼터 카운트의 근거이자 감사 기록). 실패해도 답변은 돌려준다.
    try {
      await db.insert(chatLogs).values({
        userId: actor.userId,
        roleAtTime: actor.role,
        question: q,
        answer: result.answer,
        sources: result.sources,
        handedOff: result.handedOff,
      });
    } catch (e) {
      console.error('[chatbot] chat_logs 기록 실패', e);
    }

    return NextResponse.json({
      answer: result.answer,
      sources: result.sources,
      handedOff: result.handedOff,
      dailyRemaining: quota.dailyRemaining,
    });
  } catch (e) {
    if (e instanceof InputTooLongError) return NextResponse.json({ error: 'too_long', field: e.field, max: e.max }, { status: 400 });
    return internalError('POST /api/chatbot/ask', e);
  }
}
