import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';
import { isPrivileged, isStaffPlus } from '@/auth/permissions';
import { listDutyAssignments, setDutyAssignment } from '@/recruit/duties';
import { getCohortById } from '@/recruit/cohorts';
import { resolveDutyRoles, isValidDuty, DUTY_ALL } from '@/recruit/duty-rules';
import { internalError } from '@/http/errors';
import { checkLength, InputTooLongError, LIMITS, parseDate } from '@/http/input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // 대기실 배정표도 모집 내부 정보 — 일반 부원에게 열지 않는다.
  if (!isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const cohortId = new URL(req.url).searchParams.get('cohortId');
  if (!cohortId) return NextResponse.json({ error: 'missing_cohortId' }, { status: 400 });

  try {
    const cohort = await getCohortById(cohortId);
    if (!cohort) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({
      roles: resolveDutyRoles(cohort.dutyRoles),
      assignments: await listDutyAssignments(cohortId),
    });
  } catch (e) {
    return internalError('recruit/duties GET', e);
  }
}

// 대기실 업무 배정도 '배정 = 결정' → 회장단 전용(09-RECRUIT-DESIGN §0·§4, 07-DECISIONS 41 과 같은 기준).
export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isPrivileged(actor.role)) {
    return NextResponse.json(
      { error: 'forbidden', message: '대기실 업무 배정은 회장단만 할 수 있습니다.' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { cohortId, startsAt, duty, userId, note } = body;
    if (!cohortId || !startsAt || !duty) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
    }

    const parsed = parseDate(startsAt);
    if (!parsed) return NextResponse.json({ error: 'invalid_startsAt' }, { status: 400 });

    const cohort = await getCohortById(cohortId);
    if (!cohort) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    // 임의 문자열로 행이 늘어나지 않게, 이 기수에 등록된 업무인지 서버에서 확인한다(규칙 #6).
    const roles = resolveDutyRoles(cohort.dutyRoles);
    if (!isValidDuty(duty, roles)) {
      return NextResponse.json(
        { error: 'invalid_duty', message: '이 기수에 등록되지 않은 업무입니다.' },
        { status: 400 }
      );
    }
    if (duty === DUTY_ALL) checkLength('공지 문구', note, LIMITS.title);

    const saved = await setDutyAssignment({
      cohortId,
      startsAt: parsed,
      duty,
      userId: typeof userId === 'string' && userId ? userId : null,
      note: typeof note === 'string' ? note : null,
      actorUserId: actor.userId,
    });
    return NextResponse.json({ assignment: saved });
  } catch (e) {
    if (e instanceof InputTooLongError) {
      return NextResponse.json({ error: 'too_long', message: e.message }, { status: 400 });
    }
    return internalError('recruit/duties POST', e);
  }
}
