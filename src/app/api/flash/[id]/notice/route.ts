// 개최자가 신청자 전원에게 같은 안내를 보낸다(각자의 1:1 방에 한 줄씩).
//
// 쪽지 라우트(`/api/flash-signups/[id]`)와 갈라 둔 이유: 저쪽은 **한 대화**에 쓰는 것이고
// 여기는 **한 번개의 모든 대화**에 쓰는 것이다. 대상이 다르면 권한도 다르다 —
// 저쪽은 신청자 본인도 쓰고, 여기는 개최자만 쓴다(회장단 override 도 막는다).
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { broadcastFlashMessage, FlashInputError } from '@/flash/flash';
import { PermissionError } from '@/auth/guard';
import { consumeRateLimit, RULES, RateLimitError } from '@/http/rate-limit';
import { internalError } from '@/http/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    // 한 번 눌러 여러 줄이 들어가지만 리밋은 1회로 센다 — 막으려는 것은 사람이 아니라 스크립트다.
    await consumeRateLimit(db, RULES.flashMessage, actor.userId);
    const b = await req.json();
    const sent = await broadcastFlashMessage(db, actor, id, String(b.message ?? ''));
    return NextResponse.json({ sent });
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json({ error: 'rate_limited', retryAfter: e.retryAfter }, { status: 429 });
    }
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof FlashInputError) return NextResponse.json({ error: 'bad_input', message: e.message }, { status: 400 });
    return internalError('POST /api/flash/[id]/notice', e);
  }
}
