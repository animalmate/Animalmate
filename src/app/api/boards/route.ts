import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus } from '@/auth/permissions';
import { listBoards, createBoard, BoardExistsError } from '@/boards/service';
import { PermissionError } from '@/auth/guard';
import { internalError } from '@/http/errors';
import { LIMITS, InputTooLongError, checkLength } from '@/http/input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ boards: await listBoards(db) });
}

export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const b = await req.json();
    const menuid = Number(b.menuid);
    if (!Number.isInteger(menuid) || menuid <= 0) return NextResponse.json({ error: 'bad_menuid' }, { status: 400 });
    const name = String(b.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'missing_name' }, { status: 400 });
    const purpose = b.purpose == null ? null : String(b.purpose);
    checkLength('게시판 이름', name, LIMITS.name);
    checkLength('용도', purpose, LIMITS.purpose);
    const board = await createBoard(db, actor, { menuid, name, purpose, botCanWrite: Boolean(b.botCanWrite) });
    return NextResponse.json({ board });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof BoardExistsError) return NextResponse.json({ error: 'duplicate_menuid' }, { status: 409 });
    if (e instanceof InputTooLongError) return NextResponse.json({ error: 'too_long', field: e.field, max: e.max }, { status: 400 });
    return internalError('POST /api/boards', e);
  }
}
