import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { isPrivileged, isStaffPlus } from '@/auth/permissions';
import { createSlot, createPanelSlots, listSlotsByCohort, listPanelNames, deleteSlot } from '@/recruit/slots';
import { getSlotsInterviewersMap } from '@/recruit/slot-interviewers';
import { recordAudit, buildAuditEntry } from '@/auth/audit';
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
    const { cohortId, panel, startsAt, until, durationMin, link, venue, isRemote } = body;
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

    // `until` 이 있으면 조 하나를 통째로 만든다(시작~종료를 durationMin 으로 자른다).
    if (until) {
      const parsedUntil = parseDate(until);
      if (!parsedUntil) return NextResponse.json({ error: 'invalid_until' }, { status: 400 });
      if (parsedUntil.getTime() <= parsedStartsAt.getTime()) {
        return NextResponse.json(
          { error: 'invalid_until', message: '종료 시각이 시작 시각보다 늦어야 합니다.' },
          { status: 400 }
        );
      }
      const panelName = String(panel ?? '').trim();
      if (!panelName) {
        return NextResponse.json(
          { error: 'missing_panel', message: '조 이름을 입력해 주세요(예: A조).' },
          { status: 400 }
        );
      }
      // 화면도 같은 이름을 막지만 그건 검증이 아니다 — 탭이 두 개거나 두 사람이 동시에 누르면
      // 같은 이름의 조가 두 벌 서고, 그때부터 어느 칸이 어느 방인지 표에서 갈라낼 수 없다.
      if ((await listPanelNames(cohortId)).includes(panelName)) {
        return NextResponse.json(
          { error: 'duplicate_panel', message: `"${panelName}" 은(는) 이미 있는 조입니다. 다른 이름을 쓰거나 기존 조를 지우고 다시 만드세요.` },
          { status: 409 }
        );
      }
      const slots = await createPanelSlots({
        cohortId,
        panel: panelName,
        startsAt: parsedStartsAt,
        until: parsedUntil,
        durationMin: parsedDuration,
        link: link ? String(link) : null,
        venue: venue ? String(venue) : null,
        isRemote: !!isRemote,
        createdBy: actor.userId,
      });
      // 면접 배정은 recruit.manage(관리 행위) — 누가 언제 어떤 조를 세웠는지 남긴다(규칙 #4).
      await recordAudit(
        db,
        buildAuditEntry({
          actorUserId: actor.userId,
          action: 'recruit.slot.createPanel',
          targetTable: 'recruit_slots',
          after: { cohortId, panel: panelName, count: slots.length, startsAt: parsedStartsAt, until: parsedUntil, durationMin: parsedDuration },
        })
      );
      return NextResponse.json({ slots });
    }

    const slot = await createSlot({
      cohortId,
      panel: panel ? String(panel) : null,
      startsAt: parsedStartsAt,
      durationMin: parsedDuration,
      link: link ? String(link) : null,
      venue: venue ? String(venue) : null,
      isRemote: !!isRemote,
      createdBy: actor.userId,
    });
    await recordAudit(
      db,
      buildAuditEntry({
        actorUserId: actor.userId,
        action: 'recruit.slot.create',
        targetTable: 'recruit_slots',
        targetId: slot!.id,
        after: { cohortId, panel: slot!.panel, startsAt: slot!.startsAt, durationMin: slot!.durationMin },
      })
    );

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
    const deleted = await deleteSlot(id);
    if (!deleted) return NextResponse.json({ success: true });
    // 슬롯을 지우면 거기 배정돼 있던 지원자의 slot_id 가 함께 null 이 된다(set null) — 지운 뒤에는
    // 그 시간에 누가 있었는지 어디에도 남지 않는다. 되짚을 수 있는 유일한 흔적이라 [high] 로 남긴다.
    await recordAudit(
      db,
      buildAuditEntry({
        actorUserId: actor.userId,
        action: 'recruit.slot.delete',
        targetTable: 'recruit_slots',
        targetId: id,
        before: { cohortId: deleted.cohortId, panel: deleted.panel, startsAt: deleted.startsAt, durationMin: deleted.durationMin },
        severity: 'high',
      })
    );
    return NextResponse.json({ success: true });
  } catch (e) {
    return internalError('recruit/slots DELETE', e);
  }
}
