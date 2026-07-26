import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { clientIp, consumeRateLimit, RateLimitError, RULES } from '@/http/rate-limit';
import { getCohortById, listCohorts } from '@/recruit/cohorts';
import { createSingleApplicant } from '@/recruit/applicants';
import { escapeHtml } from '@/naver/cafe-write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sanitize(text?: string | null): string | null {
  if (!text) return null;
  return escapeHtml(text.trim());
}

export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req.headers);

  try {
    await consumeRateLimit(db, RULES.recruitApply, ip);
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'rate_limited', retryAfter: e.retryAfter, message: '지원서 제출 시도 횟수가 초과되었습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 429, headers: { 'Retry-After': String(e.retryAfter) } }
      );
    }
    throw e;
  }

  try {
    const body = await req.json();
    let cohortId = String(body.cohortId ?? '').trim();

    if (!cohortId) {
      const activeList = await listCohorts();
      const firstCohort = activeList[0];
      if (!firstCohort) return NextResponse.json({ error: 'no_cohort', message: '현재 진행 중인 신입 모집 기수가 없습니다.' }, { status: 400 });
      cohortId = firstCohort.id;
    }

    const cohort = await getCohortById(cohortId);
    if (!cohort) return NextResponse.json({ error: 'not_found', message: '해당 기수를 찾을 수 없습니다.' }, { status: 404 });

    if (cohort.isClosed) {
      return NextResponse.json(
        { error: 'closed', message: '해당 기수의 신입 모집이 마감되었습니다.' },
        { status: 400 }
      );
    }

    const name = String(body.name ?? '').trim();
    const phone = String(body.phone ?? '').trim();

    if (!name || !phone) {
      return NextResponse.json({ error: 'missing_required', message: '이름과 전화번호는 필수 입력 항목입니다.' }, { status: 400 });
    }

    const applicant = await createSingleApplicant({
      cohortId,
      name: sanitize(name)!,
      phone: sanitize(phone)!,
      gender: sanitize(body.gender),
      birthDate: sanitize(body.birthDate),
      school: sanitize(body.school),
      department: sanitize(body.department),
      email: sanitize(body.email),
      applyRoute: sanitize(body.applyRoute),
      otherActivities: sanitize(body.otherActivities),
      expectedFrequency: sanitize(body.expectedFrequency),
      wishTeam1: sanitize(body.wishTeam1),
      wishTeam2: sanitize(body.wishTeam2),
      nearStation: sanitize(body.nearStation),
      otAttend: sanitize(body.otAttend),
      remoteInterviewWish: sanitize(body.remoteInterviewWish),
      essayIntro: sanitize(body.essayIntro),
      essayValues: sanitize(body.essayValues),
    });

    if (!applicant) {
      return NextResponse.json({ error: 'create_failed', message: '지원서 저장 중 오류가 발생했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, applicantId: applicant.id });
  } catch (e: any) {
    return NextResponse.json({ error: 'internal', message: e?.message }, { status: 500 });
  }
}
