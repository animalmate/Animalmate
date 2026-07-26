import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus } from '@/auth/permissions';
import { addSlotInterviewer, removeSlotInterviewer, getSlotInterviewers, getSlotsInterviewersMap } from '@/recruit/slot-interviewers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const slotId = searchParams.get('slotId');
  const slotIds = searchParams.get('slotIds')?.split(',').filter(Boolean);

  if (slotId) {
    const interviewers = await getSlotInterviewers(slotId);
    return NextResponse.json({ interviewers });
  }

  if (slotIds && slotIds.length > 0) {
    const map = await getSlotsInterviewersMap(slotIds);
    return NextResponse.json({ map });
  }

  return NextResponse.json({ error: 'missing_slotId' }, { status: 400 });
}

export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    const body = await req.json();
    const { slotId, userId } = body;

    if (!slotId || !userId) return NextResponse.json({ error: 'missing_params' }, { status: 400 });

    const created = await addSlotInterviewer(slotId, userId);
    return NextResponse.json({ ok: true, interviewer: created });
  } catch (e: any) {
    return NextResponse.json({ error: 'internal', message: e?.message }, { status: 500 });
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    const { searchParams } = new URL(req.url);
    const slotId = searchParams.get('slotId');
    const userId = searchParams.get('userId');

    if (!slotId || !userId) return NextResponse.json({ error: 'missing_params' }, { status: 400 });

    await removeSlotInterviewer(slotId, userId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: 'internal', message: e?.message }, { status: 500 });
  }
}
