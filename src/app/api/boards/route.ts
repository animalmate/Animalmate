import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus } from '@/auth/permissions';
import { listBoards, createBoard, BoardExistsError } from '@/boards/service';
import { PermissionError } from '@/auth/guard';

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
    const board = await createBoard(db, actor, {
      menuid: Number(b.menuid),
      name: String(b.name),
      purpose: b.purpose ?? null,
      botCanWrite: Boolean(b.botCanWrite),
    });
    return NextResponse.json({ board });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof BoardExistsError) return NextResponse.json({ error: 'duplicate_menuid' }, { status: 409 });
    return NextResponse.json({ error: 'internal', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
