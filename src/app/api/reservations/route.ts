import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus } from '@/auth/permissions';
import { listReservations, createReservationsMulti, type Occurrence, type SharedFields } from '@/publishing/reservations';
import { PermissionError } from '@/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const teamId = new URL(req.url).searchParams.get('teamId') ?? undefined;
  return NextResponse.json({ reservations: await listReservations(db, { teamId, actor }) });
}

export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const b = await req.json();
    const shared: SharedFields = {
      kind: b.kind === 'volunteer' ? 'volunteer' : 'general',
      teamId: b.teamId ? String(b.teamId) : undefined,
      boardMenuid: Number(b.boardMenuid),
      title: String(b.title ?? '').trim(),
      contentMd: String(b.contentMd ?? ''),
      templateId: b.templateId ? String(b.templateId) : null, // 양식의 기본 장소·정원 승계
    };
    if (shared.kind === 'volunteer' && !shared.teamId) return NextResponse.json({ error: 'missing_team' }, { status: 400 });
    if (!shared.title) return NextResponse.json({ error: 'missing_title' }, { status: 400 });
    if (!Number.isInteger(shared.boardMenuid)) return NextResponse.json({ error: 'missing_board' }, { status: 400 });
    const rawOcc: unknown[] = Array.isArray(b.occurrences) ? b.occurrences : [];
    const occurrences: Occurrence[] = rawOcc.map((o) => {
      const oo = o as { publishAt?: string; eventDate?: string; meetTime?: string };
      return {
        publishAt: oo.publishAt ? new Date(oo.publishAt) : null,
        eventDate: oo.eventDate || null,
        meetTime: oo.meetTime || null,
      };
    });
    if (occurrences.length === 0) return NextResponse.json({ error: 'no_occurrences' }, { status: 400 });
    const ids = await createReservationsMulti(db, actor, shared, occurrences);
    return NextResponse.json({ ids });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'internal', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
