import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';
import { isPrivileged, isStaffPlus } from '@/auth/permissions';
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

// 공개 스위치(면접 일정·최종 결과) 조작 = recruit.manage → 회장단 전용.
// 운영진이 결과 공개를 켤 수 있으면 "채점은 운영진, 결정은 회장단" 불변식이 깨진다
// (09-RECRUIT-DESIGN §0 역할 분담, §4 권한).
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isPrivileged(actor.role)) {
    return NextResponse.json({ error: 'forbidden', message: '공개 설정은 회장단만 변경할 수 있습니다.' }, { status: 403 });
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
