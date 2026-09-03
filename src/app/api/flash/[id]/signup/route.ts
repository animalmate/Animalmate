// 번개 신청 — **메시지가 곧 신청이다**(사용자 결정). 본문에 담긴 첫 쪽지가 신청 행을 만든다.
//
// 선착순 순번은 서비스가 트랜잭션 안에서 번개 행을 잠그고 딴다. 여기서 세면 두 사람이 같은
// 순간에 눌렀을 때 같은 번호가 나오고, 하필 그 자리가 정원 경계면 누가 확정인지 뒤집힌다 —
// 그 순서를 남기려고 만든 기능이라 거기서 흔들리면 게시판을 만든 의미가 없다.
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { signUpToFlash, FlashInputError } from '@/flash/flash';
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
    // 회원 id 로 센다 — 한자리에 모여 쓰는 동아리라 IP 로 묶으면 옆 사람 예산을 깎는다.
    await consumeRateLimit(db, RULES.flashMessage, actor.userId);
    const b = await req.json();
    const result = await signUpToFlash(db, actor, id, String(b.message ?? ''));
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json({ error: 'rate_limited', retryAfter: e.retryAfter }, { status: 429 });
    }
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof FlashInputError) return NextResponse.json({ error: 'bad_input', message: e.message }, { status: 400 });
    return internalError('POST /api/flash/[id]/signup', e);
  }
}
