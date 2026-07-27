import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';
import { isPrivileged, isStaffPlus } from '@/auth/permissions';
import { createCohort, listCohorts } from '@/recruit/cohorts';
import { internalError } from '@/http/errors';
import { checkLength, InputTooLongError, LIMITS } from '@/http/input';
import { recordAudit, buildAuditEntry } from '@/auth/audit';
import { db } from '@/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // 지원자 PII 는 없지만 기수 목록도 내부 정보 — 운영진 이상만(09-RECRUIT-DESIGN §4 열람=staff+).
  if (!isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ cohorts: await listCohorts() });
}

export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized', message: '로그인이 필요합니다.' }, { status: 401 });
  // 기수 생성 = recruit.manage → 회장단 전용(09-RECRUIT-DESIGN §4). 운영진은 채점만 한다.
  if (!isPrivileged(actor.role)) return NextResponse.json({ error: 'forbidden', message: '회장단만 기수를 만들 수 있습니다.' }, { status: 403 });

  try {
    const body = await req.json();
    const label = String(body.label ?? '').trim();
    if (!label) return NextResponse.json({ error: 'missing_label', message: '기수 명칭을 입력해주세요.' }, { status: 400 });
    checkLength('기수 명칭', label, LIMITS.name);

    const existingList = await listCohorts();
    const existing = existingList.find((c) => c.label.toLowerCase() === label.toLowerCase());
    if (existing) {
      return NextResponse.json({ cohort: existing, message: '이미 존재하여 해당 기수가 선택되었습니다.' }, { status: 200 });
    }

    const cohort = await createCohort({ label, createdBy: actor.userId });
    await recordAudit(
      db,
      buildAuditEntry({
        actorUserId: actor.userId,
        action: 'recruit.cohort.create',
        targetTable: 'recruit_cohorts',
        targetId: cohort!.id,
        after: { label },
      })
    );
    return NextResponse.json({ cohort }, { status: 201 });
  } catch (e) {
    if (e instanceof InputTooLongError) {
      return NextResponse.json({ error: 'too_long', message: e.message }, { status: 400 });
    }
    return internalError('recruit/cohorts POST', e);
  }
}
