// 챗봇 질의 — 로그인 사용자 전용. 쿼터 확인 → 답변 생성 → chat_logs 기록.
// 쿼터가 곧 레이트 리밋이다(인당 일일 + 전역 분기). 근거 없으면 핸드오프.

import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { chatLogs } from '@/db/schema';
import { getCurrentActor } from '@/auth/current-user';
import { askChatbot } from '@/rag/chatbot';
import { checkQuota, type QuotaReason } from '@/rag/quota';
import { findSensitiveIds } from '@/rag/pii';
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

    // 입력창 안내("개인정보는 입력하지 마세요")의 **서버 쪽 짝**. 안내만으로는 막히지 않는다.
    // 쿼터·생성·로그보다 **먼저** 끊어야 의미가 있다 — 여기를 지나면 질문이 chat_logs 에 남고
    // 답변 생성을 위해 Google 로도 전송된다. 되돌릴 수 없는 경로라 그 앞에서 멈춘다.
    // 전화·이메일은 대화에 정상적으로 나오므로 막지 않는다(findSensitiveIds 주석 참고).
    const sensitive = findSensitiveIds(q);
    if (sensitive.length > 0) {
      return NextResponse.json(
        {
          error: 'pii_in_question',
          // 어떤 값이 걸렸는지는 되풀이하지 않는다 — 응답에 다시 실으면 그 자체가 유출 경로다.
          message: '질문에 주민등록번호·카드·계좌번호로 보이는 숫자가 있어요. 그 부분을 빼고 다시 물어봐 주세요.',
        },
        { status: 400 }
      );
    }

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
