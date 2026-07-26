import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus, isPrivileged } from '@/auth/permissions';
import {
  listApplicantsByCohort,
  getApplicantById,
  updateApplicantStatus,
  bulkUpdateApplicantStatus,
  assignSlotToApplicant,
  updateApplicantNearStation,
} from '@/recruit/applicants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const cohortId = url.searchParams.get('cohortId');
  const applicantId = url.searchParams.get('id');

  if (applicantId) {
    const applicant = await getApplicantById(applicantId);
    if (!applicant) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ applicant });
  }

  if (!cohortId) return NextResponse.json({ error: 'missing_cohortId' }, { status: 400 });

  const applicants = await listApplicantsByCohort(cohortId);
  return NextResponse.json({ applicants });
}

export async function PATCH(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { action, id, ids, status, slotId, interviewLink, nearStation } = body;

    // 회장단 전용 행위들 (상태일괄변경 / 확정 / 슬롯배정 / 역명수정)
    if (['bulk_status', 'assign_slot', 'update_station'].includes(action)) {
      if (!isPrivileged(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    if (action === 'bulk_status') {
      if (!Array.isArray(ids) || !status) return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
      const updated = await bulkUpdateApplicantStatus(ids, status);
      return NextResponse.json({ updatedCount: updated.length });
    }

    if (action === 'assign_slot') {
      if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
      const updated = await assignSlotToApplicant(id, slotId ?? null, interviewLink);
      return NextResponse.json({ applicant: updated });
    }

    if (action === 'update_station') {
      if (!id || typeof nearStation !== 'string') return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
      const updated = await updateApplicantNearStation(id, nearStation);
      return NextResponse.json({ applicant: updated });
    }

    if (action === 'update_status') {
      if (!isPrivileged(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      if (!id || !status) return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
      const updated = await updateApplicantStatus(id, status);
      return NextResponse.json({ applicant: updated });
    }

    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: 'internal', message: e?.message }, { status: 500 });
  }
}
