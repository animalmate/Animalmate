import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus } from '@/auth/permissions';
import { createCohort, listCohorts } from '@/recruit/cohorts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ cohorts: await listCohorts() });
}

export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized', message: '로그인이 필요합니다.' }, { status: 401 });
  if (!isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden', message: '권한이 없습니다.' }, { status: 403 });

  try {
    const body = await req.json();
    const label = String(body.label ?? '').trim();
    if (!label) return NextResponse.json({ error: 'missing_label', message: '기수 명칭을 입력해주세요.' }, { status: 400 });

    const existingList = await listCohorts();
    const existing = existingList.find((c) => c.label.toLowerCase() === label.toLowerCase());
    if (existing) {
      return NextResponse.json({ cohort: existing, message: '이미 존재하여 해당 기수가 선택되었습니다.' }, { status: 200 });
    }

    const cohort = await createCohort({ label, createdBy: actor.userId });
    return NextResponse.json({ cohort }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: 'internal', message: e?.message }, { status: 500 });
  }
}
