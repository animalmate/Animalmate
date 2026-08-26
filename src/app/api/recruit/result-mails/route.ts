import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';
import { canEditRecruitNotice } from '@/auth/permissions';
import { internalError } from '@/http/errors';
import {
  previewResultMails,
  queueResultMails,
  resultMailStatus,
  SwitchOffError,
} from '@/recruit/result-mails';
import { RESULT_MAIL_STAGES, type ResultMailStage } from '@/recruit/result-mail-rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const parseStage = (v: string | null): ResultMailStage | null =>
  RESULT_MAIL_STAGES.includes(v as ResultMailStage) ? (v as ResultMailStage) : null;

/**
 * 권한은 **공개 스위치와 같다**(회장단 + 공고 편집 권한 팀).
 * 결정 141 이 "이미 정해진 결과를 지원자에게 알리는 일" 을 홍보팀에게 열었고, 안내 메일이 정확히
 * 그 일이다. 그리고 이 라우트보다 스위치 자체가 더 무겁다 — 스위치는 켜는 즉시 당락이 보이지만
 * 메일에는 당락이 없다. 합격을 **정하는 일**은 여전히 회장단이다(recruit.manage).
 */
export async function GET(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!canEditRecruitNotice(actor)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const cohortId = url.searchParams.get('cohortId');
  if (!cohortId) return NextResponse.json({ error: 'missing_cohortId' }, { status: 400 });

  try {
    const stage = parseStage(url.searchParams.get('stage'));
    // stage 를 주면 그 단계 미리보기, 안 주면 단계별 발송 현황.
    if (stage) return NextResponse.json({ preview: await previewResultMails(cohortId, stage) });
    return NextResponse.json({ status: await resultMailStatus(cohortId) });
  } catch (e) {
    return internalError('recruit/result-mails GET', e);
  }
}

export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!canEditRecruitNotice(actor)) {
    return NextResponse.json(
      { error: 'forbidden', message: '결과 안내 메일은 회장단과 공고 편집 권한이 있는 팀만 보낼 수 있습니다.' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const cohortId = String(body.cohortId ?? '').trim();
    const stage = parseStage(String(body.stage ?? ''));
    if (!cohortId || !stage) return NextResponse.json({ error: 'missing_fields' }, { status: 400 });

    const result = await queueResultMails(cohortId, stage, actor.userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof SwitchOffError) {
      return NextResponse.json({ error: 'switch_off', message: e.message }, { status: 400 });
    }
    return internalError('recruit/result-mails POST', e);
  }
}
