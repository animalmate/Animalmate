import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { setTeamActive, deleteTeam, TeamInUseError } from '@/org/teams';
import { PermissionError } from '@/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 활성/비활성 토글.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const { isActive } = await req.json();
    const team = await setTeamActive(db, actor, id, Boolean(isActive));
    return NextResponse.json({ team });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'internal', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// 하드 삭제(참조 없을 때만).
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await deleteTeam(db, actor, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof TeamInUseError) return NextResponse.json({ error: 'team_in_use', counts: e.counts }, { status: 409 });
    return NextResponse.json({ error: 'internal', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
