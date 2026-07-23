import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { markReady, schedulePost, cancelPost, NotReadyError } from '@/publishing/scheduled-posts';
import { PermissionError } from '@/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 예약 상태 액션: ready(완성 전이) / schedule(발행 대기) / cancel(취소).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const { action } = await req.json();
    if (action === 'ready') return NextResponse.json({ post: await markReady(db, actor, id) });
    if (action === 'schedule') return NextResponse.json({ post: await schedulePost(db, actor, id) });
    if (action === 'cancel') {
      await cancelPost(db, actor, id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof NotReadyError) return NextResponse.json({ error: 'not_ready', missing: e.missing }, { status: 422 });
    return NextResponse.json({ error: 'internal', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
