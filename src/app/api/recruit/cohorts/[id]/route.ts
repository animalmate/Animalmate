import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';
import { isPrivileged } from '@/auth/permissions';
import { getCohortById, updateCohortPublicSwitches } from '@/recruit/cohorts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const cohort = await getCohortById(id);
  if (!cohort) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ cohort });
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isPrivileged(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id } = await context.params;
  try {
    const body = await req.json();
    const updated = await updateCohortPublicSwitches(id, {
      schedulePublic: typeof body.schedulePublic === 'boolean' ? body.schedulePublic : undefined,
      resultPublic: typeof body.resultPublic === 'boolean' ? body.resultPublic : undefined,
    });

    return NextResponse.json({ cohort: updated });
  } catch (e: any) {
    return NextResponse.json({ error: 'internal', message: e?.message }, { status: 500 });
  }
}
