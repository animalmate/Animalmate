import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus } from '@/auth/permissions';
import { getCohortById, listCohorts } from '@/recruit/cohorts';
import { resolveApplyForm } from '@/recruit/apply-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 신입 모집 화면의 **지망 팀** 목록.
 *
 * `teams` 테이블(회원 관리)을 쓰지 않는다 — 그쪽은 기획팀·홍보팀·총무팀처럼 운영진이 일하는
 * 조직이고, 신입 지원자가 고르거나 배정되는 봉사 팀과 다르다. 목록은 기수 설정
 * (`recruit_cohorts.apply_form.wishTeamOptions`)에 있고 "0. 공고·마감 설정"에서 회장단이 편집한다.
 *
 * cohortId 를 주면 그 기수 설정을, 없으면 최신 기수 설정을 돌려준다.
 */
export async function GET(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const cohortId = new URL(req.url).searchParams.get('cohortId');
  const cohort = cohortId ? await getCohortById(cohortId) : ((await listCohorts())[0] ?? null);
  const { wishTeamOptions } = resolveApplyForm(cohort?.applyForm);

  return NextResponse.json({ teams: wishTeamOptions.map((name) => ({ name })) });
}
