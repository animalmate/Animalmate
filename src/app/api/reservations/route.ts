import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus } from '@/auth/permissions';
import {
  listReservations,
  createReservationsMulti,
  BoardNotWritableError,
  MAX_OCCURRENCES,
  type Occurrence,
  type SharedFields,
} from '@/publishing/reservations';
import { PermissionError } from '@/auth/guard';
import { internalError } from '@/http/errors';
import { LIMITS, InputTooLongError, checkLength, parseDate } from '@/http/input';

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
    checkLength('제목', shared.title, LIMITS.title);
    checkLength('본문', shared.contentMd, LIMITS.contentMd);
    const rawOcc: unknown[] = Array.isArray(b.occurrences) ? b.occurrences : [];
    const occurrences: Occurrence[] = rawOcc.map((o) => {
      const oo = o as { publishAt?: string; eventDate?: string; meetTime?: string; capacity?: string | number };
      const cap = oo.capacity != null && String(oo.capacity).trim() !== '' ? Number(oo.capacity) : null;
      return {
        publishAt: parseDate(oo.publishAt),
        eventDate: oo.eventDate || null,
        meetTime: oo.meetTime || null,
        capacity: cap != null && Number.isInteger(cap) && cap > 0 ? cap : null,
      };
    });
    if (occurrences.length === 0) return NextResponse.json({ error: 'no_occurrences' }, { status: 400 });
    if (occurrences.length > MAX_OCCURRENCES) {
      return NextResponse.json({ error: 'too_many_occurrences', max: MAX_OCCURRENCES }, { status: 400 });
    }
    const ids = await createReservationsMulti(db, actor, shared, occurrences);
    return NextResponse.json({ ids });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof BoardNotWritableError) return NextResponse.json({ error: 'board_not_writable' }, { status: 400 });
    if (e instanceof InputTooLongError) return NextResponse.json({ error: 'too_long', field: e.field, max: e.max }, { status: 400 });
    return internalError('POST /api/reservations', e);
  }
}
