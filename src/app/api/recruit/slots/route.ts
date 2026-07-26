import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus, isPrivileged } from '@/auth/permissions';
import { createSlot, listSlotsByCohort, deleteSlot } from '@/recruit/slots';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const cohortId = url.searchParams.get('cohortId');
  if (!cohortId) return NextResponse.json({ error: 'missing_cohortId' }, { status: 400 });

  const slots = await listSlotsByCohort(cohortId);
  return NextResponse.json({ slots });
}

export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isPrivileged(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    const body = await req.json();
    const { cohortId, startsAt, durationMin, link } = body;
    if (!cohortId || !startsAt) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
    }

    const slot = await createSlot({
      cohortId,
      startsAt: new Date(startsAt),
      durationMin: durationMin ? parseInt(durationMin, 10) : 20,
      link: link ? String(link) : null,
      createdBy: actor.userId,
    });

    return NextResponse.json({ slot });
  } catch (e: any) {
    return NextResponse.json({ error: 'internal', message: e?.message }, { status: 500 });
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isPrivileged(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });

  try {
    await deleteSlot(id);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: 'internal', message: e?.message }, { status: 500 });
  }
}
