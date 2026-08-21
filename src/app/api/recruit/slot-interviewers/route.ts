import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { isPrivileged, isStaffPlus } from '@/auth/permissions';
import {
  addSlotInterviewer,
  removeSlotInterviewer,
  getSlotInterviewers,
  getSlotsInterviewersMap,
  isAssignableInterviewer,
  setSlotInterviewers,
  type InterviewerRef,
} from '@/recruit/slot-interviewers';
import { listSlotsByCohort } from '@/recruit/slots';
import { recordAudit, buildAuditEntry } from '@/auth/audit';
import { internalError } from '@/http/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // 면접관 배정표도 모집 내부 정보 — 일반 부원에게 열지 않는다.
  if (!isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

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
  if (!isPrivileged(actor.role)) {
    return NextResponse.json({ error: 'forbidden', message: '면접관 배정은 회장단만 할 수 있습니다.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { slotId, userId } = body;

    if (!slotId || !userId) return NextResponse.json({ error: 'missing_params' }, { status: 400 });

    // 드롭다운이 운영진만 보여주는 것은 검증이 아니다(규칙 #6) — 임의 user id 가 통과하면
    // 부원이나 탈퇴한 사람이 시간표에 서고, 그 칸은 면접 당일에야 발견된다.
    if (!(await isAssignableInterviewer(String(userId)))) {
      return NextResponse.json(
        { error: 'not_staff', message: '활성 임기의 운영진만 면접관으로 배정할 수 있습니다.' },
        { status: 400 }
      );
    }

    const created = await addSlotInterviewer(slotId, userId);
    await recordAudit(
      db,
      buildAuditEntry({
        actorUserId: actor.userId,
        action: 'recruit.slot.interviewer.add',
        targetTable: 'recruit_slot_interviewers',
        targetId: created?.id ?? null,
        after: { slotId, userId },
      })
    );
    return NextResponse.json({ ok: true, interviewer: created });
  } catch (e) {
    return internalError('recruit/slot-interviewers', e);
  }
}

/**
 * 여러 슬롯에 같은 면접관 한 벌을 **덮어쓴다** — 엑셀 채우기 핸들(드래그 복사)에 해당한다.
 * 지난 기수 표는 같은 3명이 연속 3~6칸을 맡는다. 칸마다 3번씩 누르면 조 하나에 120번이다.
 */
export async function PUT(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isPrivileged(actor.role)) {
    return NextResponse.json({ error: 'forbidden', message: '면접관 배정은 회장단만 할 수 있습니다.' }, { status: 403 });
  }

  try {
    const { cohortId, slotIds, people } = await req.json();
    if (!cohortId) return NextResponse.json({ error: 'missing_cohort' }, { status: 400 });
    if (!Array.isArray(slotIds) || slotIds.length === 0 || !Array.isArray(people)) {
      return NextResponse.json({ error: 'missing_params' }, { status: 400 });
    }
    // 한 조가 하루 16칸이다. 그 몇 배를 넘으면 채우기가 아니라 잘못된 요청이다.
    if (slotIds.length > 200) return NextResponse.json({ error: 'too_many' }, { status: 400 });

    // 슬롯이 전부 이 기수 것인가. 화면이 이 조의 줄만 보여주는 것은 검증이 아니다(규칙 #6) —
    // 여기가 없으면 남의 기수 시간표에 면접관을 덮어쓸 수 있다.
    const known = new Set((await listSlotsByCohort(String(cohortId))).map((s) => s.id));
    if (slotIds.some((id: unknown) => typeof id !== 'string' || !known.has(id))) {
      return NextResponse.json(
        { error: 'cohort_mismatch', message: '이 기수의 면접 시간이 아닙니다.' },
        { status: 409 }
      );
    }

    // 계정을 **연결한** 사람만 자격을 본다(POST 와 같은 이유) — 부원이나 탈퇴한 계정이 콘솔에서
    // 점수를 넣게 되면 안 된다. 이름만 적은 사람은 표시용이라 검사할 계정 자체가 없다(0028).
    const refs: InterviewerRef[] = [];
    for (const p of people) {
      if (p && typeof p.userId === 'string') {
        if (!(await isAssignableInterviewer(p.userId))) {
          return NextResponse.json(
            { error: 'not_staff', message: '활성 임기의 운영진만 계정으로 배정할 수 있습니다.' },
            { status: 400 }
          );
        }
        refs.push({ userId: p.userId });
      } else if (p && typeof p.name === 'string' && p.name.trim() !== '') {
        // 이름이 길면 시간표 한 칸이 무너진다. 사람 이름 길이를 넘을 이유가 없다.
        if (p.name.trim().length > 40) {
          return NextResponse.json({ error: 'name_too_long', message: '이름은 40자까지 쓸 수 있습니다.' }, { status: 400 });
        }
        refs.push({ name: p.name.trim() });
      } else {
        return NextResponse.json({ error: 'invalid_person' }, { status: 400 });
      }
    }

    const result = await setSlotInterviewers(slotIds, refs);
    // 한 번에 수십 칸을 덮어쓴다 — 무엇이 사라졌는지 되짚을 근거를 남긴다(규칙 #4).
    await recordAudit(
      db,
      buildAuditEntry({
        actorUserId: actor.userId,
        action: 'recruit.slot.interviewer.fill',
        targetTable: 'recruit_slot_interviewers',
        targetId: String(cohortId),
        after: { slotIds, people: refs, ...result },
      })
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return internalError('recruit/slot-interviewers PUT', e);
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isPrivileged(actor.role)) {
    return NextResponse.json({ error: 'forbidden', message: '면접관 배정은 회장단만 할 수 있습니다.' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const slotId = searchParams.get('slotId');
    const userId = searchParams.get('userId');

    if (!slotId || !userId) return NextResponse.json({ error: 'missing_params' }, { status: 400 });

    const removed = await removeSlotInterviewer(slotId, userId);
    // 배정 해제가 조용히 지나가면 "면접관 미정" 칸이 왜 생겼는지 되짚을 근거가 없다.
    if (removed) {
      await recordAudit(
        db,
        buildAuditEntry({
          actorUserId: actor.userId,
          action: 'recruit.slot.interviewer.remove',
          targetTable: 'recruit_slot_interviewers',
          targetId: removed.id,
          before: { slotId, userId },
        })
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return internalError('recruit/slot-interviewers', e);
  }
}
