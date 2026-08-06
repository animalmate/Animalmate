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
} from '@/recruit/slot-interviewers';
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
