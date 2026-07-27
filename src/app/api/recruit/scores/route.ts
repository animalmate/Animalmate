import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus } from '@/auth/permissions';
import { recordScore, deleteScore, getScoresForApplicant, getScoresForCohort } from '@/recruit/scores';
import { validateScore } from '@/recruit/score-rules';
import { internalError } from '@/http/errors';
import { checkLength, InputTooLongError, LIMITS } from '@/http/input';
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

    // 내가 매긴 점수를 화면에서 골라내려면 내 userId 가 필요하다(면접 콘솔의 '내 점수' 구분).
    return NextResponse.json({ scores, aggregations, viewerUserId: actor.userId });
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
    if (stage !== 'document' && stage !== 'interview') {
      return NextResponse.json({ error: 'invalid_stage' }, { status: 400 });
    }

    const numScore = parseFloat(score);
    // 사용자에게 돌려줄 수 있는 검증 실패는 여기서 걸러 400 으로 답한다.
    // 그 아래 catch 는 DB 오류 등 내부 사정이므로 메시지를 노출하지 않는다.
    if (!validateScore(numScore)) {
      return NextResponse.json(
        { error: 'invalid_score', message: '점수는 0.0~10.0 사이 0.5 단위로 입력해 주세요.' },
        { status: 400 }
      );
    }
    checkLength('코멘트', comment, LIMITS.contentMd);

    await recordScore(applicantId, actor.userId, stage, numScore, comment);
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof InputTooLongError) {
      return NextResponse.json({ error: 'too_long', message: e.message }, { status: 400 });
    }
    return internalError('recruit/scores POST', e);
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
  } catch (e) {
    return internalError('recruit/scores DELETE', e);
  }
}
