import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus } from '@/auth/permissions';
import { recordScore, deleteScore, getScoresForApplicant, getScoresForCohort } from '@/recruit/scores';
import { aggregateScoresByApplicant } from '@/recruit/aggregate';
import { listApplicantsByCohort } from '@/recruit/applicants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const applicantId = url.searchParams.get('applicantId');
  const cohortId = url.searchParams.get('cohortId');

  if (applicantId) {
    const scores = await getScoresForApplicant(applicantId);
    return NextResponse.json({ scores });
  }

  if (cohortId) {
    const scores = await getScoresForCohort(cohortId);
    const applicants = await listApplicantsByCohort(cohortId);
    const applicantIds = applicants.map((a) => a.id);
    const aggregations = aggregateScoresByApplicant(applicantIds, scores);

    return NextResponse.json({ scores, aggregations });
  }

  return NextResponse.json({ error: 'missing_parameter' }, { status: 400 });
}

export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    const body = await req.json();
    const { applicantId, stage, score, comment } = body;

    if (!applicantId || !stage || score === undefined) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
    }

    const numScore = parseFloat(score);
    await recordScore(applicantId, actor.userId, stage, numScore, comment);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: 'bad_request', message: e?.message }, { status: 400 });
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const applicantId = url.searchParams.get('applicantId');
  const stage = url.searchParams.get('stage') as 'document' | 'interview' | null;

  if (!applicantId || !stage) {
    return NextResponse.json({ error: 'missing_parameters' }, { status: 400 });
  }

  try {
    await deleteScore(applicantId, actor.userId, stage);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: 'internal', message: e?.message }, { status: 500 });
  }
}
