import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';
import { isPrivileged, isStaffPlus } from '@/auth/permissions';
import { createSlot, listSlotsByCohort, deleteSlot } from '@/recruit/slots';
import { getSlotsInterviewersMap } from '@/recruit/slot-interviewers';
import { internalError } from '@/http/errors';
import { parseDate } from '@/http/input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const cohortId = url.searchParams.get('cohortId');
  if (!cohortId) return NextResponse.json({ error: 'missing_cohortId' }, { status: 400 });

  // 면접관 배정까지 함께 돌려준다. 예전엔 슬롯을 받은 뒤 그 id 로 다시 요청해야 해서
  // 화면 진입·갱신 때마다 왕복이 한 번씩 더 늘었다(배포 환경 왕복이 500ms 대라 체감이 크다).
  const slots = await listSlotsByCohort(cohortId);
  const interviewersMap = await getSlotsInterviewersMap(slots.map((s) => s.id));
  return NextResponse.json({ slots, interviewersMap });
}

// 면접 슬롯 생성·삭제 = 면접 배정 = recruit.manage → 회장단 전용(09-RECRUIT-DESIGN §4).
export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isPrivileged(actor.role)) {
    return NextResponse.json({ error: 'forbidden', message: '면접 슬롯 관리는 회장단만 할 수 있습니다.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { cohortId, startsAt, durationMin, link, venue, isRemote } = body;
    if (!cohortId || !startsAt) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
    }

    // 잘못된 날짜 문자열이 Invalid Date 로 DB 에 들어가지 않게 막는다.
    const parsedStartsAt = parseDate(startsAt);
    if (!parsedStartsAt) return NextResponse.json({ error: 'invalid_startsAt' }, { status: 400 });

    const parsedDuration = durationMin ? parseInt(String(durationMin), 10) : 20;
    if (!Number.isFinite(parsedDuration) || parsedDuration <= 0 || parsedDuration > 24 * 60) {
      return NextResponse.json({ error: 'invalid_durationMin' }, { status: 400 });
    }

    const slot = await createSlot({
      cohortId,
      startsAt: parsedStartsAt,
      durationMin: parsedDuration,
      link: link ? String(link) : null,
      venue: venue ? String(venue) : null,
      isRemote: !!isRemote,
      createdBy: actor.userId,
    });

    return NextResponse.json({ slot });
  } catch (e) {
    return internalError('recruit/slots POST', e);
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isPrivileged(actor.role)) {
    return NextResponse.json({ error: 'forbidden', message: '면접 슬롯 관리는 회장단만 할 수 있습니다.' }, { status: 403 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });

  try {
    await deleteSlot(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return internalError('recruit/slots DELETE', e);
  }
}
