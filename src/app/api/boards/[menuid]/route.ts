import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { updateBoard, deleteBoard, type UpdateBoardPatch } from '@/boards/service';
import { PermissionError } from '@/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 게시판 수정(이름/용도/봇쓰기/활성). 봇이 카페스탭으로 임명된 뒤 botCanWrite 를 켜는 등.
export async function PATCH(req: Request, ctx: { params: Promise<{ menuid: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const menuid = Number((await ctx.params).menuid);
  try {
    const b = await req.json();
    const patch: UpdateBoardPatch = {};
    if (b.name !== undefined) patch.name = String(b.name);
    if (b.purpose !== undefined) patch.purpose = b.purpose === null ? null : String(b.purpose);
    if (b.botCanWrite !== undefined) patch.botCanWrite = Boolean(b.botCanWrite);
    if (b.isActive !== undefined) patch.isActive = Boolean(b.isActive);
    const board = await updateBoard(db, actor, menuid, patch);
    return NextResponse.json({ board });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'internal', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// 소프트 삭제(is_active=false).
export async function DELETE(_req: Request, ctx: { params: Promise<{ menuid: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const menuid = Number((await ctx.params).menuid);
  try {
    const board = await deleteBoard(db, actor, menuid);
    return NextResponse.json({ board });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'internal', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
