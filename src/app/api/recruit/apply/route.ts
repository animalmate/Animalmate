import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { clientIp, consumeRateLimit, RateLimitError, RULES } from '@/http/rate-limit';
import { getCohortById, listCohorts } from '@/recruit/cohorts';
import { submitApplicant } from '@/recruit/applicants';
import { recordAudit, buildAuditEntry } from '@/auth/audit';
import { internalError } from '@/http/errors';
import { checkLength, InputTooLongError, LIMITS } from '@/http/input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 저장 시점에 HTML 이스케이프하지 않는다.
// 화면은 전부 React 가 텍스트로 렌더하고(dangerouslySetInnerHTML 미사용) 원본이 필요한 곳도
// 있어서(CSV export, 심사 화면의 자기소개서 원문), 저장 단계에서 escapeHtml 을 걸면 "김&박" 이
// "김&amp;박" 으로 굳어 이중 이스케이프로 보인다. 이스케이프는 HTML 로 나가는 경로
// (네이버 카페 글쓰기)에서만 한다.
function clean(text?: unknown): string | null {
  if (text == null) return null;
  const s = String(text).trim();
  return s === '' ? null : s;
}

/** 공개 접수 폼이라 길이 상한이 없으면 누구나 수 MB 를 밀어 넣을 수 있다(무료 티어 소진). */
function checkApplicantLengths(f: Record<string, string | null>): void {
  checkLength('이름', f.name, LIMITS.name);
  checkLength('전화번호', f.phone, LIMITS.phone);
  checkLength('이메일', f.email, LIMITS.email);
  for (const key of ['gender', 'birthDate', 'school', 'department', 'applyRoute', 'expectedFrequency', 'wishTeam1', 'wishTeam2', 'nearStation', 'otAttend', 'remoteInterviewWish']) {
    checkLength(key, f[key] ?? null, LIMITS.name);
  }
  checkLength('다른 대외활동', f.otherActivities, LIMITS.purpose);
  checkLength('영문 이름', f.englishName, LIMITS.name);
  checkLength('가치관 주제', f.essayValuesTopic, LIMITS.name);
  checkLength('자기소개', f.essayIntro, LIMITS.contentMd);
  checkLength('가치관', f.essayValues, LIMITS.contentMd);
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

    // 개인정보 수집·이용 동의 없이는 접수하지 않는다. 지원자는 비부원이고 자기소개서까지 받으므로
    // 동의가 곧 수집 근거다. 화면에서 버튼을 잠그는 것은 검증이 아니다(규칙 #6).
    if (body.privacyConsent !== true) {
      return NextResponse.json(
        { error: 'consent_required', message: '개인정보 수집·이용에 동의해야 지원서를 제출할 수 있습니다.' },
        { status: 400 }
      );
    }

    let cohortId = String(body.cohortId ?? '').trim();

    if (!cohortId) {
      // 마감·폐기된 기수는 건너뛰고 접수 중인 최신 기수를 고른다.
      // 예전엔 무조건 최신 기수를 집어서, 그 기수가 마감이면 접수 자체가 막혔다.
      const activeList = await listCohorts();
      const open = activeList.find((c) => !c.isClosed && !c.archivedStats);
      if (!open) return NextResponse.json({ error: 'no_cohort', message: '현재 진행 중인 신입 모집 기수가 없습니다.' }, { status: 400 });
      cohortId = open.id;
    }

    const cohort = await getCohortById(cohortId);
    if (!cohort) return NextResponse.json({ error: 'not_found', message: '해당 기수를 찾을 수 없습니다.' }, { status: 404 });

    if (cohort.isClosed) {
      return NextResponse.json(
        { error: 'closed', message: '해당 기수의 신입 모집이 마감되었습니다.' },
        { status: 400 }
      );
    }

    // 폐기된 기수는 지원자 데이터가 이미 삭제된 상태다. 여기에 새 지원서가 들어가면
    // 아무도 보지 않는 곳에 남는다(마감 스위치와 별개라 isClosed 검사만으로는 막히지 않는다).
    if (cohort.archivedStats) {
      return NextResponse.json(
        { error: 'closed', message: '해당 기수의 신입 모집이 종료되었습니다.' },
        { status: 400 }
      );
    }

    const fields = {
      name: clean(body.name),
      phone: clean(body.phone),
      gender: clean(body.gender),
      birthDate: clean(body.birthDate),
      school: clean(body.school),
      department: clean(body.department),
      email: clean(body.email),
      applyRoute: clean(body.applyRoute),
      otherActivities: clean(body.otherActivities),
      expectedFrequency: clean(body.expectedFrequency),
      wishTeam1: clean(body.wishTeam1),
      wishTeam2: clean(body.wishTeam2),
      nearStation: clean(body.nearStation),
      otAttend: clean(body.otAttend),
      remoteInterviewWish: clean(body.remoteInterviewWish),
      essayIntro: clean(body.essayIntro),
      essayValues: clean(body.essayValues),
      essayValuesTopic: clean(body.essayValuesTopic),
      englishName: clean(body.englishName),
    };

    if (!fields.name || !fields.phone) {
      return NextResponse.json({ error: 'missing_required', message: '이름과 전화번호는 필수 입력 항목입니다.' }, { status: 400 });
    }
    checkApplicantLengths(fields);

    // 같은 기수에 같은 사람(이름+전화)이 다시 내면 **마지막 지원서만 남긴다** — 새 행을 만들지 않고
    // 제자리에서 갈아 끼운다(면접 배정·점수·메모가 지원자 id 를 물고 있다. submitApplicant 주석).
    const outcome = await submitApplicant({
      cohortId,
      ...fields,
      name: fields.name,
      phone: fields.phone,
    });

    if (!outcome) {
      return NextResponse.json({ error: 'create_failed', message: '지원서 저장 중 오류가 발생했습니다.' }, { status: 500 });
    }

    if (outcome.replaced) {
      // **내용은 남기지 않는다.** 자기소개서·연락처는 PII 라 기수 파기(`recruit/purge`)로 지워져야
      // 하는데, audit_logs 는 그 파기 범위 밖이다. 여기 본문을 복사하면 파기해도 사본이 남는다.
      // 남길 값은 "언제 누구 지원서가 갈렸는가"와 **채점 뒤였는지**뿐이다 — 점수가 이미 있는데
      // 내용이 바뀌었다면 채점자가 읽은 글과 지금 글이 다르다는 뜻이라 운영진이 알아야 한다.
      // 지원자는 로그인하지 않으므로 actorUserId 는 null(= 공개 폼 본인 제출)이다.
      await recordAudit(
        db,
        buildAuditEntry({
          actorUserId: null,
          action: 'recruit.applicant.resubmit',
          targetTable: 'recruit_applicants',
          targetId: outcome.applicantId,
          before: { status: outcome.previousStatus, scoreCount: outcome.previousScoreCount },
          after: { cohortId },
          // 채점이 끝난 지원서가 갈린 것은 눈에 띄어야 한다.
          ...(outcome.previousScoreCount > 0 ? { severity: 'high' as const } : {}),
        })
      );
    }

    return NextResponse.json({ ok: true, applicantId: outcome.applicantId, replaced: outcome.replaced });
  } catch (e) {
    if (e instanceof InputTooLongError) {
      return NextResponse.json({ error: 'too_long', message: e.message }, { status: 400 });
    }
    return internalError('recruit/apply POST', e);
  }
}
