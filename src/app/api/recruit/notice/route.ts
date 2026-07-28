import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';
import { isPrivileged, isStaffPlus } from '@/auth/permissions';
import { getCohortById, listCohorts } from '@/recruit/cohorts';
import { updateCohortNoticeAndSettings } from '@/recruit/notice';
import { resolveApplyForm } from '@/recruit/apply-form';
import { resolveDutyRoles } from '@/recruit/duty-rules';
import { pruneDutyAssignments } from '@/recruit/duties';
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
      dutyRoles: resolveDutyRoles(cohort.dutyRoles),
      // 지원서 양식 설정은 편집 화면에서만 필요하다(공개 지원서 화면은 서버 컴포넌트가 DB 에서 직접 읽는다).
      applyForm: resolveApplyForm(cohort.applyForm),
      schedulePublic: cohort.schedulePublic,
      resultPublic: cohort.resultPublic,
    },
  });
}

// 이 화면은 홍보 업무(공고 본문·포스터·지원서 문항)와 결정 업무(마감 스위치·합격자 안내문)가
// 한 화면에 섞여 있다. 그래서 **필드 단위로** 권한을 나눈다 — 운영진(홍보팀)이 공고를 쓰고,
// 대외 결정에 해당하는 값은 회장단만 바꾼다(09-RECRUIT-DESIGN §4 recruit.manage).
//
// 운영진이 못 바꾸는 필드: isClosed(접수 차단), congratsMessage·postPassNotice(합격자에게 나가는 문구),
// venues(면접 장소 프리셋 — 면접 배정은 회장단 일이다).
//
// 화면이 값을 통째로 보내오므로 **"보냈다"가 아니라 "바뀌었다"로 판정한다**. 그렇지 않으면
// 운영진이 공고만 고쳐 저장해도 함께 실려 온 기존 값 때문에 403 이 나서 저장 자체가 불가능해진다.
const MANAGE_ONLY_FIELDS = [
  { key: 'isClosed', label: '모집 마감 스위치' },
  { key: 'congratsMessage', label: '합격 축하 멘트' },
  { key: 'postPassNotice', label: '합격 후 안내' },
  { key: 'venues', label: '면접 장소 프리셋' },
  { key: 'dutyRoles', label: '대기실 업무 목록' }, // 면접 당일 배정과 같은 급 = 회장단
] as const;

/** 얕은 값 비교(문자열·불리언·문자열 배열). 이 네 필드에 중첩 객체는 없다. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const xs = Array.isArray(a) ? a : [];
    const ys = Array.isArray(b) ? b : [];
    return xs.length === ys.length && xs.every((v, i) => v === ys[i]);
  }
  // null 과 '' 는 화면 왕복에서 서로 바뀌므로 같은 것으로 본다(빈 값 → 헛된 403 방지).
  const norm = (v: unknown) => (v === null || v === undefined ? '' : v);
  return norm(a) === norm(b);
}

export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isStaffPlus(actor.role)) {
    return NextResponse.json({ error: 'forbidden', message: '모집 공고 설정은 운영진 이상만 변경할 수 있습니다.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { cohortId, noticeContent, noticeImages, congratsMessage, postPassNotice, isClosed, venues, dutyRoles, applyForm } = body;

    if (!cohortId) return NextResponse.json({ error: 'missing_cohortId' }, { status: 400 });

    checkLength('모집 공고', noticeContent, LIMITS.contentMd);
    checkLength('합격 축하 멘트', congratsMessage, LIMITS.contentMd);
    checkLength('합격 후 안내', postPassNotice, LIMITS.contentMd);

    const before = await getCohortById(cohortId);
    if (!before) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    if (!isPrivileged(actor.role)) {
      // venues 는 GET 이 기본값을 채워 내려보내므로(DB 는 null) 비교도 같은 기준으로 해야 한다.
      const beforeValue = (key: string): unknown =>
        key === 'venues'
          ? (before.venues ?? DEFAULT_VENUES)
          : key === 'dutyRoles'
          ? resolveDutyRoles(before.dutyRoles)
          : (before as Record<string, unknown>)[key];
      const attempted = MANAGE_ONLY_FIELDS.filter(
        (f) => body[f.key] !== undefined && !sameValue(body[f.key], beforeValue(f.key))
      );
      if (attempted.length > 0) {
        return NextResponse.json(
          {
            error: 'forbidden',
            message: `${attempted.map((f) => f.label).join(' · ')}은(는) 회장단만 변경할 수 있습니다.`,
          },
          { status: 403 }
        );
      }
    }

    const updated = await updateCohortNoticeAndSettings(cohortId, {
      noticeContent,
      noticeImages,
      congratsMessage,
      postPassNotice,
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
