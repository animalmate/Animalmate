import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';
import { canEditRecruitNotice, isStaffPlus } from '@/auth/permissions';
import { getCohortById, getPublicNoticeCohort, listCohorts } from '@/recruit/cohorts';
import { updateCohortNoticeAndSettings } from '@/recruit/notice';
import { resolveApplyForm } from '@/recruit/apply-form';
import { resolveDutyRoles } from '@/recruit/duty-rules';
import { isOwnStorageUrl } from '@/storage/notice-images';
import { pruneDutyAssignments } from '@/recruit/duties';
import { internalError } from '@/http/errors';
import { checkLength, InputTooLongError, LIMITS } from '@/http/input';
import { recordAudit, buildAuditEntry } from '@/auth/audit';
import { db } from '@/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// route 파일은 정해진 이름만 export 할 수 있어 지역 상수로 둔다.
const DEFAULT_VENUES = ['학생회관 301호', '학생회관 302호'];
const MAX_NOTICE_IMAGES = 10;

// GET 은 비로그인 공개 공고 페이지(/recruit/notice)가 쓴다.
// 따라서 **공개해도 되는 필드만** 내보낸다. 합격 축하 멘트(congratsMessage)·합격 후 안내
// (postPassNotice)·면접 안내 문구(docPassMessage·interviewNotice)·면접 장소 프리셋(venues)·
// 공개 스위치는 내부 정보라 비로그인에 주지 않는다
// — 예전엔 전부 나가서 발표 전에 합격자 안내문이 공개 URL 로 읽혔다.
// 운영진 이상(공고 편집 화면)에는 전체를 준다.
export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const cohortId = searchParams.get('cohortId');

  const actor = await getCurrentActor();
  const isInternal = Boolean(actor && actor.membershipActive && isStaffPlus(actor.role));

  // 기수를 지정하지 않았을 때의 기본값이 **보는 사람에 따라 다르다.**
  //  - 비로그인/부원: 공개 화면과 같은 기수(본문이 채워진 최신) — 그냥 최신을 집으면 다음 기수를
  //    만드는 순간 진행 중이던 공고가 내려간다(getPublicNoticeCohort 주석).
  //  - 운영진 이상: 최신 기수 그대로. 편집 화면은 **아직 본문이 없는 새 기수를 열어야** 하므로
  //    여기까지 좁히면 방금 만든 기수를 못 연다(지금은 편집 화면이 항상 cohortId 를 넘기지만,
  //    기본값이 그 화면을 막는 모양으로 남아 있으면 안 된다).
  const cohort = cohortId
    ? await getCohortById(cohortId)
    : isInternal
      ? ((await listCohorts())[0] ?? null)
      : await getPublicNoticeCohort();
  if (!cohort) return NextResponse.json({ cohort: null }, { status: 200 });

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
      docPassMessage: cohort.docPassMessage,
      interviewNotice: cohort.interviewNotice,
      venues: cohort.venues ?? DEFAULT_VENUES,
      dutyRoles: resolveDutyRoles(cohort.dutyRoles),
      // 지원서 양식 설정은 편집 화면에서만 필요하다(공개 지원서 화면은 서버 컴포넌트가 DB 에서 직접 읽는다).
      applyForm: resolveApplyForm(cohort.applyForm),
      schedulePublic: cohort.schedulePublic,
      resultPublic: cohort.resultPublic,
    },
  });
}

// 이 라우트의 **필드 단위 권한 구분은 없어졌다**(2026-08-25, 결정 141 — 사용자 지시).
// 게이트를 통과한 사람(회장단 + 공고 편집 권한이 켜진 팀)은 이 화면의 값을 전부 바꾼다:
// 공고 본문·포스터·지원서 문항 + 마감 스위치·합격 축하 멘트·합격 후 안내·면접 장소 프리셋·
// 대기실 업무 목록.
//
// 결정 66 이 잠재워 두고 결정 140 이 잠깐 되살렸던 `MANAGE_ONLY_FIELDS` 블록은 여기서 지웠다
// (필요하면 git 이력에 있다). 다시 필드를 가르려면 **"보냈다"가 아니라 "바뀌었다"로 판정**해야
// 한다는 점만 기억할 것 — 화면이 값을 통째로 보내오므로 보낸 것만 보면 공고만 고쳐 저장해도
// 403 이 나서 저장 자체가 불가능해진다.
//
// 여전히 이 라우트 밖에 있는 것: 기수 삭제 · 서류/최종 확정 · 면접 배정 · 지원자 팀 변경(회장단).

export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // 회장단 + 공고 편집 권한이 켜진 팀(홍보팀). 화면(page.tsx)만 열고 여기를 두면 URL 로 그대로
  // 저장된다 — UI 를 숨기거나 여는 것은 권한 검사가 아니다(규칙 #6).
  // 운영진 전원이 아니라 **플래그가 켜진 팀**만이다(07-DECISIONS 140, 결정 66 이 막았던 구멍).
  // 통과하면 이 화면의 값은 전부 바꿀 수 있다(결정 141).
  if (!canEditRecruitNotice(actor)) {
    return NextResponse.json(
      { error: 'forbidden', message: '모집 공고는 회장단과 공고 편집 권한이 있는 팀만 수정할 수 있습니다.' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const {
      cohortId,
      noticeContent,
      noticeImages,
      congratsMessage,
      postPassNotice,
      docPassMessage,
      interviewNotice,
      isClosed,
      venues,
      dutyRoles,
      applyForm,
    } = body;

    if (!cohortId) return NextResponse.json({ error: 'missing_cohortId' }, { status: 400 });

    checkLength('모집 공고', noticeContent, LIMITS.contentMd);
    checkLength('합격 축하 멘트', congratsMessage, LIMITS.contentMd);
    checkLength('합격 후 안내', postPassNotice, LIMITS.contentMd);
    checkLength('서류 합격 안내 멘트', docPassMessage, LIMITS.contentMd);
    checkLength('면접 안내 사항', interviewNotice, LIMITS.contentMd);

    // 포스터 URL 은 요청 본문에서 그대로 DB 로 들어가고 있었다 — `isOwnStorageUrl` 이
    // 바로 이걸 막으려고 만들어졌는데 어디에도 연결돼 있지 않았다.
    // 공고는 비로그인에게 공개되는 페이지라, 남의 서버 이미지를 걸면 방문자 IP 가 그쪽으로 샌다.
    if (noticeImages !== undefined) {
      if (!Array.isArray(noticeImages) || noticeImages.some((u) => typeof u !== 'string')) {
        return NextResponse.json({ error: 'invalid_images' }, { status: 400 });
      }
      if (noticeImages.length > MAX_NOTICE_IMAGES) {
        return NextResponse.json(
          { error: 'too_many_images', message: `포스터는 최대 ${MAX_NOTICE_IMAGES}장까지 올릴 수 있습니다.` },
          { status: 400 }
        );
      }
      const foreign = (noticeImages as string[]).filter((u) => !isOwnStorageUrl(u));
      if (foreign.length > 0) {
        return NextResponse.json(
          { error: 'foreign_image', message: '포스터는 이 화면에서 업로드한 이미지만 쓸 수 있습니다.' },
          { status: 400 }
        );
      }
    }

    const before = await getCohortById(cohortId);
    if (!before) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const updated = await updateCohortNoticeAndSettings(cohortId, {
      noticeContent,
      noticeImages,
      congratsMessage,
      postPassNotice,
      docPassMessage,
      interviewNotice,
      isClosed,
      venues,
      // 업무 이름을 바꾸면 없어진 이름으로 남은 배정은 화면에 뜨지 않는다(유령 행) → 아래에서 정리.
      dutyRoles: dutyRoles === undefined ? undefined : resolveDutyRoles(dutyRoles),
      // 저장 전에 정규화한다 — 빈 선택지 배열이 DB 에 들어가 지원서가 빈 셀렉트로 뜨는 일을 막는다.
      applyForm: applyForm === undefined ? undefined : resolveApplyForm(applyForm),
    });

    // 업무 이름이 바뀌었으면 사라진 이름의 배정을 정리한다. 남겨 두면 화면에는 안 뜨는데
    // DB 에만 있는 행이 되어, 나중에 같은 이름을 다시 쓰면 옛 배정이 되살아난다.
    if (dutyRoles !== undefined) {
      await pruneDutyAssignments(cohortId, resolveDutyRoles(dutyRoles));
    }

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
