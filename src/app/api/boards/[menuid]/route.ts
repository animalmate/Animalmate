import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { updateBoard, deleteBoard, type UpdateBoardPatch } from '@/boards/service';
import { PermissionError } from '@/auth/guard';
import { internalError } from '@/http/errors';
import { LIMITS, InputTooLongError, checkLength } from '@/http/input';

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
    checkLength('게시판 이름', patch.name, LIMITS.name);
    checkLength('용도', patch.purpose, LIMITS.purpose);
    const board = await updateBoard(db, actor, menuid, patch);
    return NextResponse.json({ board });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof InputTooLongError) return NextResponse.json({ error: 'too_long', field: e.field, max: e.max }, { status: 400 });
    return internalError('PATCH /api/boards/[menuid]', e);
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
    return internalError('DELETE /api/boards/[menuid]', e);
  }
}
