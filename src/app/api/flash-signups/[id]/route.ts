// 신청 한 건에 대한 동작 — 쪽지 보내기(POST), 신청 취소·내보내기(DELETE).
//
// `/api/flash/[id]/...` 아래가 아니라 따로 뺀 이유: 여기서 다루는 id 는 **번개**가 아니라
// **신청**이다. 같은 자리에 두면 `/api/flash/<신청id>` 같은 호출이 조용히 404 가 아니라
// 엉뚱한 곳으로 가는 실수를 부른다.
//
// 쪽지는 신청자 본인과 개최자만 쓸 수 있다. **회장단이라도 남의 1:1 대화에는 못 쓴다** —
// 번개 글을 관리하라는 권한이지 사적인 대화에 끼어들라는 권한이 아니다(서비스가 판단).
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { postFlashMessage, cancelFlashSignup, FlashInputError } from '@/flash/flash';
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
    await consumeRateLimit(db, RULES.flashMessage, actor.userId);
    const b = await req.json();
    const message = await postFlashMessage(db, actor, id, String(b.message ?? ''));
    return NextResponse.json({ message });
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json({ error: 'rate_limited', retryAfter: e.retryAfter }, { status: 429 });
    }
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof FlashInputError) return NextResponse.json({ error: 'bad_input', message: e.message }, { status: 400 });
    return internalError('POST /api/flash-signups/[id]', e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await cancelFlashSignup(db, actor, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof FlashInputError) return NextResponse.json({ error: 'bad_input', message: e.message }, { status: 400 });
    return internalError('DELETE /api/flash-signups/[id]', e);
  }
}
