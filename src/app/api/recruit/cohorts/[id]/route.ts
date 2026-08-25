import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';
import { canEditRecruitNotice, isPrivileged, isStaffPlus } from '@/auth/permissions';
import { deleteCohort, getCohortById, updateCohortPublicSwitches } from '@/recruit/cohorts';
import { listApplicantsByCohort } from '@/recruit/applicants';
import { internalError } from '@/http/errors';
import { recordAudit, buildAuditEntry } from '@/auth/audit';
import { db } from '@/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id } = await context.params;
  const cohort = await getCohortById(id);
  if (!cohort) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ cohort });
}

// 공개 스위치(면접 일정·최종 결과) 조작 = recruit.notice → 회장단 + 공고 편집 권한이 켜진 팀
// (2026-08-25, 결정 141 — 사용자 지시로 회장단 전용에서 넓혔다).
//
// ⚠ 이 라우트에서 **가장 무거운 것이 resultPublic 이다**: 켜는 순간 지원자가 /recruit 조회에서
//   합격 여부를 보고, 되돌려도 이미 본 사람은 되돌릴 수 없다. 그래서 아래 audit 는 severity=high
//   이고, 이 값만은 누가 언제 켰는지가 반드시 남아야 한다.
//   **합격 여부를 정하는 것 자체는 여전히 회장단이다**(bulk_status·최종 확정은 recruit.manage).
//   여기서 여는 것은 "이미 회장단이 확정한 결과를 지원자에게 보여줄지"뿐이다.
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!canEditRecruitNotice(actor)) {
    return NextResponse.json(
      { error: 'forbidden', message: '공개 설정은 회장단과 공고 편집 권한이 있는 팀만 변경할 수 있습니다.' },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  try {
    const body = await req.json();
    const before = await getCohortById(id);
    if (!before) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const updated = await updateCohortPublicSwitches(id, {
      schedulePublic: typeof body.schedulePublic === 'boolean' ? body.schedulePublic : undefined,
      resultPublic: typeof body.resultPublic === 'boolean' ? body.resultPublic : undefined,
    });

    // 결과 공개 전환은 지원자에게 즉시 보이는 되돌리기 어려운 결정 — 항상 audit(규칙 #4).
    await recordAudit(
      db,
      buildAuditEntry({
        actorUserId: actor.userId,
        action: 'recruit.cohort.publicSwitch',
        targetTable: 'recruit_cohorts',
        targetId: id,
        before: { schedulePublic: before.schedulePublic, resultPublic: before.resultPublic },
        after: { schedulePublic: updated?.schedulePublic, resultPublic: updated?.resultPublic },
        severity: 'high',
      })
    );

    return NextResponse.json({ cohort: updated });
  } catch (e) {
    return internalError('recruit/cohorts PATCH', e);
  }
}

// 기수 삭제는 하위 지원자·점수·메모까지 cascade 로 지운다(복구 불가).
// 지원자가 남아 있으면 여기서 지우지 않는다 — 익명 집계(archived_stats)를 남기는
// 폐기 절차 `/api/recruit/purge` 를 반드시 거치게 한다(09-RECRUIT-DESIGN §8).
// 여기서 허용하는 것은 "빈 기수(잘못 만든 기수) 정리"뿐이다.
export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // 삭제는 **생성과 짝이 아니다** — 회장단 전용이다(07-DECISIONS 140, 사용자 결정).
  // 홍보팀에게 여는 것은 기수 **생성**뿐이다(공고를 쓰려면 담을 기수가 먼저 있어야 하니까).
  // 삭제는 아래 두 그물(지원자 0명 + 명칭 재입력)을 통과하면 되돌릴 수 없고, 잘못 만든 기수를
  // 치우는 일은 급하지 않다. 공고를 쓰다 실수로 지우는 쪽이 훨씬 비싸다.
  if (!isPrivileged(actor.role)) {
    return NextResponse.json({ error: 'forbidden', message: '기수 삭제는 회장단만 할 수 있습니다.' }, { status: 403 });
  }

  const { id } = await context.params;
  try {
    const cohort = await getCohortById(id);
    if (!cohort) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const applicants = await listApplicantsByCohort(id);
    if (applicants.length > 0) {
      return NextResponse.json(
        {
          error: 'has_applicants',
          message: `지원자 ${applicants.length}명이 남아 있어 삭제할 수 없습니다. 데이터 폐기(집계 보존)를 먼저 실행해 주세요.`,
        },
        { status: 409 }
      );
    }

    // 2단계 확인: 기수 라벨 재입력(09-RECRUIT-DESIGN §8).
    const url = new URL(req.url);
    const confirmLabel = url.searchParams.get('confirmLabel');
    if (confirmLabel !== cohort.label) {
      return NextResponse.json(
        { error: 'invalid_confirmation', message: '확인을 위해 기수 명칭을 정확히 입력해 주세요.' },
        { status: 400 }
      );
    }

    const deleted = await deleteCohort(id);
    if (!deleted) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    await recordAudit(
      db,
      buildAuditEntry({
        actorUserId: actor.userId,
        action: 'recruit.cohort.delete',
        targetTable: 'recruit_cohorts',
        targetId: id,
        before: { label: cohort.label },
        severity: 'high',
      })
    );

    return NextResponse.json({ ok: true, deleted });
  } catch (e) {
    return internalError('recruit/cohorts DELETE', e);
  }
}
