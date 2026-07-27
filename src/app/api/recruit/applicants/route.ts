import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';
import { isPrivileged, isStaffPlus } from '@/auth/permissions';
import {
  listApplicantsByCohort,
  listApplicantsByCohortSlim,
  listApplicantsByIds,
  getApplicantById,
  updateApplicantStatus,
  bulkUpdateApplicantStatus,
  assignSlotToApplicant,
  updateApplicantNearStation,
  updateApplicantTeam,
  bulkUpdateApplicantTeam,
} from '@/recruit/applicants';
import { canTransition, type RecruitStatus } from '@/recruit/status';
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

  // slim=1 이면 자기소개서 본문을 뺀다(50명 기준 60.9KB → 8.9KB).
  const applicants =
    url.searchParams.get('slim') === '1'
      ? await listApplicantsByCohortSlim(cohortId)
      : await listApplicantsByCohort(cohortId);
  return NextResponse.json({ applicants });
}

export async function PATCH(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { action, id, ids, status, cohortId, slotId, interviewLink, nearStation, assignedTeam } = body;

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
      // 기수를 반드시 받아 그 범위로 좁힌다. 없으면 id 만으로 전 기수에서 찾게 되어,
      // 조작된 요청이 화면에서 고른 기수 밖의 지원자까지 확정할 수 있다.
      if (!cohortId) return NextResponse.json({ error: 'missing_cohort' }, { status: 400 });

      // 단계를 건너뛴 확정을 서버에서 막는다(09-RECRUIT-DESIGN §3).
      // 최종 결정 화면은 팀으로만 걸러서 심사 전 지원자도 목록에 뜨므로, 전체 선택 후 확정하면
      // 서류·면접을 안 거친 사람이 최종 합격이 될 수 있었다.
      // 자격이 되는 사람만 바꾸고, 제외된 인원은 숫자로 알려 준다(1명 때문에 전체를 막지 않는다).
      const targets = await listApplicantsByIds(ids, cohortId);
      const eligible = targets
        .filter((a) => canTransition(a.status as RecruitStatus, status as RecruitStatus))
        .map((a) => a.id);
      // 두 가지 제외를 구분한다. 예전엔 둘을 합쳐 놓고 "단계가 맞지 않아 제외"라고만 알려 줘서,
      // 없는 id 나 다른 기수 사람을 골랐을 때도 단계 문제인 줄 알고 넘어갔다.
      const skippedCount = targets.length - eligible.length; // 실제로 단계가 안 맞는 사람
      const outOfScopeCount = ids.length - targets.length; // 이 기수에 없는 id

      if (eligible.length === 0) {
        return NextResponse.json(
          {
            error: 'invalid_transition',
            message: '선택한 지원자는 지금 단계에서 이 상태로 바꿀 수 없습니다.',
            updatedCount: 0,
            skippedCount,
            outOfScopeCount,
          },
          { status: 409 }
        );
      }

      const updated = await bulkUpdateApplicantStatus(eligible, status);
      // 서류/최종 확정은 되돌리기 어려운 결정 — 누가 언제 몇 명을 어떤 상태로 바꿨는지 남긴다(규칙 #4).
      await recordAudit(
        db,
        buildAuditEntry({
          actorUserId: actor.userId,
          action: 'recruit.applicant.bulkStatus',
          targetTable: 'recruit_applicants',
          after: {
            status,
            cohortId,
            applicantIds: eligible,
            count: updated.length,
            skipped: skippedCount,
            outOfScope: outOfScopeCount,
          },
          severity: 'high',
        })
      );
      return NextResponse.json({ updatedCount: updated.length, skippedCount, outOfScopeCount });
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
      if (!before) return NextResponse.json({ error: 'not_found' }, { status: 404 });
      if (!canTransition(before.status as RecruitStatus, status as RecruitStatus)) {
        return NextResponse.json(
          { error: 'invalid_transition', message: '지금 단계에서는 이 상태로 바꿀 수 없습니다.' },
          { status: 409 }
        );
      }
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

