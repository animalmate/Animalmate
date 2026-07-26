import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus } from '@/auth/permissions';
import { getCohortById, listCohorts } from '@/recruit/cohorts';
import { updateCohortNoticeAndSettings } from '@/recruit/notice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const cohortId = searchParams.get('cohortId');

  let cohort;
  if (cohortId) {
    cohort = await getCohortById(cohortId);
  } else {
    const list = await listCohorts();
    cohort = list[0] ?? null;
  }

  if (!cohort) return NextResponse.json({ cohort: null }, { status: 200 });

  return NextResponse.json({
    cohort: {
      id: cohort.id,
      label: cohort.label,
      noticeContent: cohort.noticeContent,
      noticeImages: cohort.noticeImages ?? [],
      congratsMessage: cohort.congratsMessage,
      postPassNotice: cohort.postPassNotice,
      isClosed: cohort.isClosed,
      venues: cohort.venues ?? ['학생회관 301호', '학생회관 302호'],
      schedulePublic: cohort.schedulePublic,
      resultPublic: cohort.resultPublic,
    },
  });
}

export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    const body = await req.json();
    const { cohortId, noticeContent, noticeImages, congratsMessage, postPassNotice, isClosed, venues } = body;

    if (!cohortId) return NextResponse.json({ error: 'missing_cohortId' }, { status: 400 });

    const updated = await updateCohortNoticeAndSettings(cohortId, {
      noticeContent,
      noticeImages,
      congratsMessage,
      postPassNotice,
      isClosed,
      venues,
    });

    return NextResponse.json({ cohort: updated });
  } catch (e: any) {
    return NextResponse.json({ error: 'internal', message: e?.message }, { status: 500 });
  }
}
