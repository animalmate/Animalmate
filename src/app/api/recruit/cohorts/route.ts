import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';
import { canEditRecruitNotice, isStaffPlus } from '@/auth/permissions';
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
  // 기수 생성 = recruit.notice → 회장단 + 공고 편집 권한이 켜진 팀(홍보팀). 그냥 운영진은 채점만 한다.
  // 공고를 쓰려면 담을 기수가 먼저 있어야 하므로 공고 편집과 같은 칸에 둔다(07-DECISIONS 140).
  // 같은 이름이 이미 있으면 새로 만들지 않고 그것을 돌려주므로, 중복 기수가 쌓이지는 않는다.
  // **삭제는 여기 짝이 아니다** — `DELETE /cohorts/[id]` 는 회장단 전용이다(되돌릴 수 없다).
  if (!canEditRecruitNotice(actor)) {
    return NextResponse.json(
      { error: 'forbidden', message: '기수는 회장단과 공고 편집 권한이 있는 팀만 만들 수 있습니다.' },
      { status: 403 }
    );
  }

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
