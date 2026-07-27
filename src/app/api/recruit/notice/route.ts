import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';
import { isPrivileged, isStaffPlus } from '@/auth/permissions';
import { getCohortById, listCohorts } from '@/recruit/cohorts';
import { updateCohortNoticeAndSettings } from '@/recruit/notice';
import { resolveApplyForm } from '@/recruit/apply-form';
import { internalError } from '@/http/errors';
import { checkLength, InputTooLongError, LIMITS } from '@/http/input';
import { recordAudit, buildAuditEntry } from '@/auth/audit';
import { db } from '@/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// route 파일은 정해진 이름만 export 할 수 있어 지역 상수로 둔다.
const DEFAULT_VENUES = ['학생회관 301호', '학생회관 302호'];

// GET 은 비로그인 공개 공고 페이지(/recruit/notice)가 쓴다.
// 따라서 **공개해도 되는 필드만** 내보낸다. 합격 축하 멘트(congratsMessage)·합격 후 안내
// (postPassNotice)·면접 장소 프리셋(venues)·공개 스위치는 내부 정보라 비로그인에 주지 않는다
// — 예전엔 전부 나가서 발표 전에 합격자 안내문이 공개 URL 로 읽혔다.
// 운영진 이상(공고 편집 화면)에는 전체를 준다.
export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const cohortId = searchParams.get('cohortId');

  const cohort = cohortId ? await getCohortById(cohortId) : ((await listCohorts())[0] ?? null);
  if (!cohort) return NextResponse.json({ cohort: null }, { status: 200 });

  const actor = await getCurrentActor();
  const isInternal = Boolean(actor && actor.membershipActive && isStaffPlus(actor.role));

  const publicFields = {
    id: cohort.id,
    label: cohort.label,
    noticeContent: cohort.noticeContent,
    noticeImages: cohort.noticeImages ?? [],
    isClosed: cohort.isClosed,
  };

  if (!isInternal) {
    return NextResponse.json({ cohort: publicFields });
  }

  return NextResponse.json({
    cohort: {
      ...publicFields,
      congratsMessage: cohort.congratsMessage,
      postPassNotice: cohort.postPassNotice,
      venues: cohort.venues ?? DEFAULT_VENUES,
      // 지원서 양식 설정은 편집 화면에서만 필요하다(공개 지원서 화면은 서버 컴포넌트가 DB 에서 직접 읽는다).
      applyForm: resolveApplyForm(cohort.applyForm),
      schedulePublic: cohort.schedulePublic,
      resultPublic: cohort.resultPublic,
    },
  });
}

// 공고 본문·마감 스위치는 지원자에게 그대로 보이는 대외 문구 →
// recruit.manage(회장단 전용, 09-RECRUIT-DESIGN §4).
export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isPrivileged(actor.role)) {
    return NextResponse.json({ error: 'forbidden', message: '모집 공고·마감 설정은 회장단만 변경할 수 있습니다.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { cohortId, noticeContent, noticeImages, congratsMessage, postPassNotice, isClosed, venues, applyForm } = body;

    if (!cohortId) return NextResponse.json({ error: 'missing_cohortId' }, { status: 400 });

    checkLength('모집 공고', noticeContent, LIMITS.contentMd);
    checkLength('합격 축하 멘트', congratsMessage, LIMITS.contentMd);
    checkLength('합격 후 안내', postPassNotice, LIMITS.contentMd);

    const before = await getCohortById(cohortId);
    if (!before) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const updated = await updateCohortNoticeAndSettings(cohortId, {
      noticeContent,
      noticeImages,
      congratsMessage,
      postPassNotice,
      isClosed,
      venues,
      // 저장 전에 정규화한다 — 빈 선택지 배열이 DB 에 들어가 지원서가 빈 셀렉트로 뜨는 일을 막는다.
      applyForm: applyForm === undefined ? undefined : resolveApplyForm(applyForm),
    });

    // 모집 마감 전환은 지원 접수를 막는 대외 효과가 있어 기록에 남긴다(규칙 #4).
    if (typeof isClosed === 'boolean' && isClosed !== before.isClosed) {
      await recordAudit(
        db,
        buildAuditEntry({
          actorUserId: actor.userId,
          action: 'recruit.cohort.closeSwitch',
          targetTable: 'recruit_cohorts',
          targetId: cohortId,
          before: { isClosed: before.isClosed },
          after: { isClosed },
        })
      );
    }

    return NextResponse.json({ cohort: updated });
  } catch (e) {
    if (e instanceof InputTooLongError) {
      return NextResponse.json({ error: 'too_long', message: e.message }, { status: 400 });
    }
    return internalError('recruit/notice POST', e);
  }
}
