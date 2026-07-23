import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus } from '@/auth/permissions';
import { getReservation, updateReservation } from '@/publishing/reservations';
import { PermissionError } from '@/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const detail = await getReservation(db, id);
  if (!detail) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(detail);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const b = await req.json();
    await updateReservation(db, actor, id, {
      title: b.title,
      contentMd: b.contentMd,
      publishAt: b.publishAt !== undefined ? (b.publishAt ? new Date(b.publishAt) : null) : undefined,
      eventDate: b.eventDate,
      meetTime: b.meetTime,
      place: b.place,
      capacity: b.capacity !== undefined && b.capacity !== '' ? Number(b.capacity) : b.capacity === '' ? null : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'internal', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
