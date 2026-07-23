import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus } from '@/auth/permissions';
import { listReservations, createReservation, type CreateReservationInput } from '@/publishing/reservations';
import { PermissionError } from '@/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const teamId = new URL(req.url).searchParams.get('teamId') ?? undefined;
  return NextResponse.json({ reservations: await listReservations(db, { teamId }) });
}

export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const b = await req.json();
    const publishAt = b.publishAt ? new Date(b.publishAt) : null;
    const input: CreateReservationInput =
      b.kind === 'volunteer'
        ? {
            kind: 'volunteer',
            teamId: String(b.teamId),
            boardMenuid: Number(b.boardMenuid),
            title: String(b.title),
            contentMd: String(b.contentMd ?? ''),
            publishAt,
            eventDate: b.eventDate || null,
            meetTime: b.meetTime || null,
            place: b.place || null,
            capacity: b.capacity != null && b.capacity !== '' ? Number(b.capacity) : null,
          }
        : {
            kind: 'general',
            boardMenuid: Number(b.boardMenuid),
            title: String(b.title),
            contentMd: String(b.contentMd ?? ''),
            publishAt,
          };
    const post = await createReservation(db, actor, input);
    return NextResponse.json({ id: post.id });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'internal', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
