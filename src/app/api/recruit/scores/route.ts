import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus } from '@/auth/permissions';
import { recordScore, deleteScore, getScoresForApplicant, getScoresForCohort } from '@/recruit/scores';
import { validateScore } from '@/recruit/score-rules';
import { internalError } from '@/http/errors';
import { checkLength, InputTooLongError, LIMITS } from '@/http/input';
import { aggregateScoresByApplicant } from '@/recruit/aggregate';
import { listApplicantIdsByCohort } from '@/recruit/applicants';

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
    // 집계에 필요한 것은 "이 기수에 누가 있나"뿐이다. 예전에는 지원자 전문을 읽어 id 만 뽑아 버렸는데,
    // 채점 화면이 점수를 저장할 때마다 이 API 를 다시 부르므로 203명 기수에서는 한 명 채점할 때마다
    // 자기소개서 전문을 한 벌씩 읽고 버리는 셈이었다. 두 조회는 서로를 필요로 하지 않아 함께 띄운다.
    const [scores, applicantIds] = await Promise.all([
      getScoresForCohort(cohortId),
      listApplicantIdsByCohort(cohortId),
    ]);
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

    // 바뀐 상태를 함께 돌려준다 — 화면이 목록 전체를 다시 받지 않고 딱지만 고칠 수 있게(면접 단계).
    const { applicantStatus } = await recordScore(applicantId, actor.userId, stage, numScore, comment);
    return NextResponse.json({ success: true, applicantStatus });
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
    // 저장(POST)과 같은 모양으로 바뀐 상태를 돌려준다 — 화면이 명단 전체를 다시 받지 않고
    // 딱지만 고칠 수 있게. 마지막 면접 점수를 지우면 '서류 합격'으로 되돌아간다.
    const { applicantStatus } = await deleteScore(applicantId, actor.userId, stage);
    return NextResponse.json({ success: true, applicantStatus });
  } catch (e) {
    return internalError('recruit/scores DELETE', e);
  }
}
