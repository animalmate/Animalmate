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
  bulkAssignSlots,
  setAttendance,
  setReviewMark,
} from '@/recruit/applicants';
import { getSlotById, listSlotsByCohort } from '@/recruit/slots';
import { canTransition, canMarkAttendance, type RecruitStatus } from '@/recruit/status';
import { parseReviewMark } from '@/recruit/review-marks';
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
    const { action, id, ids, status, cohortId, slotId, interviewLink, nearStation, assignedTeam, assignments } = body;

    // 지원자 상태·배정을 바꾸는 행위는 전부 "결정" → 회장단 전용(09-RECRUIT-DESIGN §0·§4).
    // change_team/bulk_team 도 여기 포함된다: 예전엔 isPRTeamOrPrivileged 를 썼지만 그 함수는
    // teamId(UUID)에 'pr'/'홍보' 가 들어있는지 보는 검사라 실제로는 절대 참이 되지 않았다
    // (= 사실상 회장단 전용). 착시를 없애고 실제 동작과 일치시킨다.
    // ⚠ 결정 140 이 만든 `canEditRecruitNotice`(홍보팀 개방)를 여기에 끌어오지 말 것 —
    //    그것은 **공고를 쓰는 권한**이고, 여기는 지원자의 합격·배정을 바꾸는 **결정**이다.
    if (['bulk_status', 'assign_slot', 'assign_slot_bulk', 'update_station', 'change_team', 'bulk_team'].includes(action)) {
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

    // 면접 출결 — **면접관(운영진)이 면접 콘솔에서** 표시한다(2026-07-31, 결정 67).
    // 불참은 면접관이 그 자리에서 본 사실이다. 예전에는 도움말만 "회장단이 5번 화면에서 표시한다"고
    // 말했고 실제로는 **어느 화면에도 입력 수단이 없었다**(상태값과 전이 규칙만 있었다).
    // 되돌리기도 같은 자리에서 된다 — 잘못 눌렀을 때 회장단을 부르게 하지 않는다.
    if (action === 'attendance') {
      if (!isStaffPlus(actor.role)) {
        return NextResponse.json({ error: 'forbidden', message: '면접 출결은 운영진만 표시할 수 있습니다.' }, { status: 403 });
      }
      if (!id || typeof body.noshow !== 'boolean') return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
      // 기수를 받아 그 범위로 좁힌다 — id 만으로 전 기수를 뒤지면 다른 기수 지원자를 건드릴 수 있다.
      if (!cohortId) return NextResponse.json({ error: 'missing_cohort' }, { status: 400 });

      const [target] = await listApplicantsByIds([id], cohortId);
      if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 });

      // ⚠ 여기서 canTransition 만 믿으면 안 된다. 불참 취소의 도착지가 doc_pass 일 수 있어
      // `received → doc_pass`(= 서류 합격 확정, 회장단 권한)가 이 운영진 경로로 열린다.
      // canMarkAttendance 가 출결에 허용된 출발 상태를 따로 못 박는다(2026-07-31 QA).
      if (!canMarkAttendance(target.status as RecruitStatus, body.noshow)) {
        return NextResponse.json(
          {
            error: 'invalid_transition',
            message: body.noshow
              ? '면접 단계 지원자만 불참으로 표시할 수 있습니다.'
              : '불참으로 표시된 지원자만 되돌릴 수 있습니다.',
          },
          { status: 409 }
        );
      }
      // 불참 표시는 회장단 수동 전이 규칙으로 한 번 더 거른다. 되돌리기는 여기서 검사하지 않는다 —
      // 도착지를 사람이 고르는 것이 아니라 **면접 점수라는 사실에서 계산**하고(setAttendance),
      // canTransition 은 `interview_done` 을 수동 목적지로 인정하지 않는다(자동 전이 전용).
      if (body.noshow && !canTransition(target.status as RecruitStatus, 'interview_noshow')) {
        return NextResponse.json(
          { error: 'invalid_transition', message: '지금 단계에서는 불참으로 표시할 수 없습니다.' },
          { status: 409 }
        );
      }

      const moved = await setAttendance(target.id, body.noshow);
      if (!moved) return NextResponse.json({ error: 'not_found' }, { status: 404 });
      await recordAudit(
        db,
        buildAuditEntry({
          actorUserId: actor.userId,
          action: 'recruit.applicant.attendance',
          targetTable: 'recruit_applicants',
          targetId: target.id,
          before: { status: moved.before },
          after: { status: moved.after },
        })
      );
      return NextResponse.json({ status: moved.after });
    }

    // 최종 검토(5번)의 의견 표시 — **팀장단이 회의 중에 누르는 값**이라 운영진 이상에게 연다.
    // 상태를 바꾸지 않으므로 회장단 전용(recruit.manage)이 아니라 채점과 같은 층(recruit.score,
    // staff+)이다: 여기서 붙는 것은 "이렇게 하자"는 의견이고, 합격/불합격은 6번에서 회장단이 정한다.
    if (action === 'review_mark') {
      if (!isStaffPlus(actor.role)) {
        return NextResponse.json(
          { error: 'forbidden', message: '검토 표시는 운영진만 할 수 있습니다.' },
          { status: 403 }
        );
      }
      if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
      // 기수를 받아 범위를 좁힌다 — id 만으로 전 기수를 뒤지면 다른 기수 지원자에 표시가 붙는다.
      if (!cohortId) return NextResponse.json({ error: 'missing_cohort' }, { status: 400 });

      // `null`(표시 지우기)과 오타를 반드시 갈라야 한다. 합쳐 두면 'drpo' 같은 값이 지우기로
      // 읽혀 표시가 조용히 사라진다(parseReviewMark 주석).
      const mark = parseReviewMark(body.reviewMark);
      if (mark === undefined) return NextResponse.json({ error: 'invalid_mark' }, { status: 400 });

      // 갈 팀은 그대로 넘긴다 — 'move' 가 아닐 때 지우는 일은 서비스가 한다(setReviewMark).
      // 안 고를 수 있는 값이라 없다고 400 을 내지 않는다.
      const moved = await setReviewMark(String(cohortId), id, mark, body.reviewMoveTeam);
      if (!moved) return NextResponse.json({ error: 'not_found' }, { status: 404 });
      await recordAudit(
        db,
        buildAuditEntry({
          actorUserId: actor.userId,
          action: 'recruit.applicant.reviewMark',
          targetTable: 'recruit_applicants',
          targetId: id,
          before: moved.before,
          after: moved.after,
        })
      );
      return NextResponse.json(moved.after);
    }

    if (action === 'assign_slot') {
      if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
      const applicant = await getApplicantById(id);
      if (!applicant) return NextResponse.json({ error: 'not_found' }, { status: 404 });

      // 지원자와 슬롯이 같은 기수인지 서버에서 맞춰 본다. id 두 개만 믿으면 **다른 기수 슬롯**에
      // 배정할 수 있고, 그러면 그 슬롯은 이 기수 화면에 안 보이는 채로 사람이 하나 들어앉는다
      // (bulk_status·attendance 가 cohortId 를 받아 범위를 좁히는 것과 같은 이유).
      if (slotId) {
        const slot = await getSlotById(String(slotId));
        if (!slot) return NextResponse.json({ error: 'not_found', message: '없는 면접 시간입니다.' }, { status: 404 });
        if (slot.cohortId !== applicant.cohortId) {
          return NextResponse.json(
            { error: 'cohort_mismatch', message: '다른 기수의 면접 시간에는 배정할 수 없습니다.' },
            { status: 409 }
          );
        }
      }

      const updated = await assignSlotToApplicant(id, slotId ?? null, interviewLink);
      // 면접 시간 배정도 '결정'이다 — 배정이 사라졌을 때 누가 언제 바꿨는지 되짚을 근거를 남긴다(규칙 #4).
      await recordAudit(
        db,
        buildAuditEntry({
          actorUserId: actor.userId,
          action: 'recruit.applicant.assignSlot',
          targetTable: 'recruit_applicants',
          targetId: id,
          before: { slotId: applicant.slotId },
          after: { slotId: slotId ?? null },
        })
      );
      return NextResponse.json({ applicant: updated });
    }

    if (action === 'assign_slot_bulk') {
      if (!cohortId) return NextResponse.json({ error: 'missing_cohort' }, { status: 400 });
      if (!Array.isArray(assignments) || assignments.length === 0) {
        return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
      }
      // 한 번에 밀어 넣을 수 있는 양을 제한한다 — 기수 하나가 200명대라 그 두 배면 충분하고,
      // CASE 문이 무한정 길어지는 것도 막는다.
      if (assignments.length > 500) {
        return NextResponse.json({ error: 'too_many', message: '한 번에 500명까지 배정할 수 있습니다.' }, { status: 400 });
      }

      const clean: { applicantId: string; slotId: string | null }[] = [];
      for (const a of assignments) {
        if (!a || typeof a.applicantId !== 'string') {
          return NextResponse.json({ error: 'invalid_assignment' }, { status: 400 });
        }
        clean.push({ applicantId: a.applicantId, slotId: typeof a.slotId === 'string' ? a.slotId : null });
      }

      // 슬롯이 전부 이 기수 것인지 한 번에 확인한다. assign_slot 이 한 건마다 확인하는 것과 같은
      // 이유인데(다른 기수 슬롯에 사람이 들어앉는다), 여기서는 슬롯 목록을 한 번만 읽으면 된다.
      const cohortSlotIds = new Set((await listSlotsByCohort(String(cohortId))).map((s) => s.id));
      const strayed = clean.filter((a) => a.slotId && !cohortSlotIds.has(a.slotId));
      if (strayed.length > 0) {
        return NextResponse.json(
          { error: 'cohort_mismatch', message: '다른 기수의 면접 시간에는 배정할 수 없습니다.' },
          { status: 409 }
        );
      }

      // 지원자도 이 기수 소속인지 본다. bulkAssignSlots 의 where 가 남의 기수를 걸러 내지만,
      // 그것만으로는 **조용히 빠진다** — 몇 명이 왜 안 들어갔는지 화면에 말해 줘야 한다.
      const known = await listApplicantsByIds(
        clean.map((a) => a.applicantId),
        String(cohortId)
      );
      const knownIds = new Set(known.map((a) => a.id));
      const targets = clean.filter((a) => knownIds.has(a.applicantId));
      const outOfScopeCount = clean.length - targets.length;
      if (targets.length === 0) {
        return NextResponse.json(
          { error: 'not_found', message: '이 기수에 없는 지원자입니다.', updatedCount: 0, outOfScopeCount },
          { status: 404 }
        );
      }

      // 되돌리려면 어디에 있었는지가 있어야 한다 — 바꾸기 전 슬롯을 audit 에 남긴다(규칙 #4).
      const beforeById = new Map(
        (await listApplicantsByCohortSlim(String(cohortId))).map((a) => [a.id, a.slotId ?? null])
      );
      const updated = await bulkAssignSlots(String(cohortId), targets);

      await recordAudit(
        db,
        buildAuditEntry({
          actorUserId: actor.userId,
          action: 'recruit.applicant.assignSlotBulk',
          targetTable: 'recruit_applicants',
          targetId: String(cohortId),
          before: { slots: targets.map((t) => ({ id: t.applicantId, slotId: beforeById.get(t.applicantId) ?? null })) },
          after: { slots: targets, count: updated.length },
        })
      );

      return NextResponse.json({ updatedCount: updated.length, outOfScopeCount, applicants: updated });
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

