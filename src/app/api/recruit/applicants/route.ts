import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';
import { isPrivileged, isStaffPlus } from '@/auth/permissions';
import {
  listApplicantsByCohort,
  getApplicantById,
  updateApplicantStatus,
  bulkUpdateApplicantStatus,
  assignSlotToApplicant,
  updateApplicantNearStation,
  updateApplicantTeam,
  bulkUpdateApplicantTeam,
} from '@/recruit/applicants';
import { internalError } from '@/http/errors';
import { recordAudit, buildAuditEntry } from '@/auth/audit';
import { db } from '@/db/client';

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
    const { action, id, ids, status, slotId, interviewLink, nearStation, assignedTeam } = body;

    // 지원자 상태·배정을 바꾸는 행위는 전부 "결정" → 회장단 전용(09-RECRUIT-DESIGN §0·§4).
    // change_team/bulk_team 도 여기 포함된다: 예전엔 isPRTeamOrPrivileged 를 썼지만 그 함수는
    // teamId(UUID)에 'pr'/'홍보' 가 들어있는지 보는 검사라 실제로는 절대 참이 되지 않았다
    // (= 사실상 회장단 전용). 착시를 없애고 실제 동작과 일치시킨다.
    if (['bulk_status', 'assign_slot', 'update_station', 'change_team', 'bulk_team'].includes(action)) {
      if (!isPrivileged(actor.role)) {
        return NextResponse.json({ error: 'forbidden', message: '이 작업은 회장단만 할 수 있습니다.' }, { status: 403 });
      }
    }

    if (action === 'bulk_status') {
      if (!Array.isArray(ids) || !status) return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
      const updated = await bulkUpdateApplicantStatus(ids, status);
      // 서류/최종 확정은 되돌리기 어려운 결정 — 누가 언제 몇 명을 어떤 상태로 바꿨는지 남긴다(규칙 #4).
      await recordAudit(
        db,
        buildAuditEntry({
          actorUserId: actor.userId,
          action: 'recruit.applicant.bulkStatus',
          targetTable: 'recruit_applicants',
          after: { status, applicantIds: ids, count: updated.length },
          severity: 'high',
        })
      );
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
      const before = await getApplicantById(id);
      const updated = await updateApplicantStatus(id, status);
      await recordAudit(
        db,
        buildAuditEntry({
          actorUserId: actor.userId,
          action: 'recruit.applicant.status',
          targetTable: 'recruit_applicants',
          targetId: id,
          before: { status: before?.status },
          after: { status },
        })
      );
      return NextResponse.json({ applicant: updated });
    }

    if (action === 'change_team') {
      if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
      const updated = await updateApplicantTeam(id, assignedTeam ?? null);
      return NextResponse.json({ applicant: updated });
    }

    if (action === 'bulk_team') {
      if (!Array.isArray(ids)) return NextResponse.json({ error: 'missing_ids' }, { status: 400 });
      const updated = await bulkUpdateApplicantTeam(ids, assignedTeam ?? null);
      return NextResponse.json({ updatedCount: updated.length });
    }

    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  } catch (e) {
    return internalError('recruit/applicants PATCH', e);
  }
}

export async function POST(req: Request): Promise<Response> {
  return PATCH(req);
}

