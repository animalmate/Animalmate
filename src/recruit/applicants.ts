// F9 신입 모집 지원자 CRUD 및 관리 서비스
import { db } from '../db/client';
import { recruitApplicants, recruitCohorts, recruitScores } from '../db/schema';
import { eq, and, inArray, asc, sql } from 'drizzle-orm';
import { attendanceRevertTarget, RecruitStatus } from './status';
import { normalizeMoveTeam, type ReviewMark } from './review-marks';
import { shortTeamName } from './team-name';

/**
 * 행에 덮어씌울 팀 이름 3종. 지원자가 고른 값에 지역이 붙어 있으면("1팀 - 강남(집결지 강남역)")
 * 팀 이름만 남긴다 — 심사·집계 화면의 배지가 길어지고, 선택지가 "1팀"으로 짧아진 뒤로는
 * 팀 필터에도 걸리지 않는다. DB 값은 그대로 둔다(옛 기수 기록을 고쳐 쓸 이유가 없다).
 */
const shortTeamsOf = (r: {
  assignedTeam: string | null;
  wishTeam1: string | null;
  wishTeam2: string | null;
}) => ({
  assignedTeam: shortTeamName(r.assignedTeam),
  wishTeam1: shortTeamName(r.wishTeam1),
  wishTeam2: shortTeamName(r.wishTeam2),
});

export async function listApplicantsByCohort(cohortId: string) {
  const rows = await db
    .select()
    .from(recruitApplicants)
    .where(eq(recruitApplicants.cohortId, cohortId))
    .orderBy(asc(recruitApplicants.name));
  return rows.map((r) => ({ ...r, ...shortTeamsOf(r) }));
}

/**
 * 목록·배정·집계 화면용 축약 조회. 자기소개서 본문을 빼면 50명 기준 60.9KB → 8.9KB 다.
 * 지원서 전문을 읽는 화면(서류 심사·면접 콘솔)만 위 전체 조회를 쓴다.
 */
export async function listApplicantsByCohortSlim(cohortId: string) {
  const rows = await db
    .select({
      id: recruitApplicants.id,
      name: recruitApplicants.name,
      phone: recruitApplicants.phone,
      school: recruitApplicants.school,
      department: recruitApplicants.department,
      assignedTeam: recruitApplicants.assignedTeam,
      wishTeam1: recruitApplicants.wishTeam1,
      wishTeam2: recruitApplicants.wishTeam2,
      status: recruitApplicants.status,
      reviewMark: recruitApplicants.reviewMark,
      reviewMoveTeam: recruitApplicants.reviewMoveTeam,
      slotId: recruitApplicants.slotId,
      interviewLink: recruitApplicants.interviewLink,
      nearStation: recruitApplicants.nearStation,
      remoteInterviewWish: recruitApplicants.remoteInterviewWish,
      // 6번 최종 결정 화면이 합격자 명단에 함께 뽑는다(외부 단체 가입용). 한 줄짜리 값이라
      // 축약 조회의 목적(자기소개서 본문 빼기)을 해치지 않는다.
      englishName: recruitApplicants.englishName,
    })
    .from(recruitApplicants)
    .where(eq(recruitApplicants.cohortId, cohortId))
    .orderBy(asc(recruitApplicants.name));
  return rows.map((r) => ({ ...r, ...shortTeamsOf(r) }));
}

/**
 * 집계에 쓸 **id 만** 읽는다.
 *
 * 점수 조회(`/api/recruit/scores?cohortId=`)는 "이 기수에 누가 있나"만 알면 되는데 예전에는
 * `listApplicantsByCohort` 를 불러 자기소개서 전문까지 끌어왔다. 채점 화면은 점수를 저장할 때마다
 * 이 API 를 다시 부르므로, 203명 기수에서는 한 명 채점할 때마다 수백 KB 를 읽고 버린 셈이다.
 */
export async function listApplicantIdsByCohort(cohortId: string): Promise<string[]> {
  const rows = await db
    .select({ id: recruitApplicants.id })
    .from(recruitApplicants)
    .where(eq(recruitApplicants.cohortId, cohortId));
  return rows.map((r) => r.id);
}

export async function getApplicantById(id: string) {
  const [found] = await db
    .select()
    .from(recruitApplicants)
    .where(eq(recruitApplicants.id, id));
  return found ? { ...found, ...shortTeamsOf(found) } : null;
}

/** 상태 전이 검증을 위해 대상 지원자들의 현재 상태를 한 번에 읽는다. */
/**
 * 지원자 id 목록으로 조회한다. `cohortId` 를 주면 그 기수 소속만 남긴다.
 *
 * 이름 주의: 예전 이름은 `listApplicantsByCohortIds` 였는데 실제로는 **지원자 id** 로 찾는 함수라,
 * 기수 id 로 거르는 줄 오해하기 딱 좋았다. 하필 최종 합격을 확정하는 bulk_status 경로에서 쓰인다.
 *
 * `cohortId` 를 받는 이유: 그 오해대로 기수 범위가 실제로는 걸리지 않아, 조작된 요청이면 화면에서
 * 고른 기수가 아닌 다른 기수 지원자의 상태까지 바꿀 수 있었다(규칙 #6 — 화면으로 거르는 것은 검증이 아니다).
 */
export async function listApplicantsByIds(ids: string[], cohortId?: string) {
  if (ids.length === 0) return [];
  return db
    .select({ id: recruitApplicants.id, status: recruitApplicants.status })
    .from(recruitApplicants)
    .where(
      cohortId
        ? and(inArray(recruitApplicants.id, ids), eq(recruitApplicants.cohortId, cohortId))
        : inArray(recruitApplicants.id, ids)
    );
}

export async function updateApplicantStatus(id: string, status: RecruitStatus) {
  const [updated] = await db
    .update(recruitApplicants)
    .set({ status })
    .where(eq(recruitApplicants.id, id))
    .returning();
  return updated;
}

export async function bulkUpdateApplicantStatus(
  ids: string[],
  status: RecruitStatus
) {
  if (ids.length === 0) return [];
  return db
    .update(recruitApplicants)
    .set({ status })
    .where(inArray(recruitApplicants.id, ids))
    .returning();
}

export async function assignSlotToApplicant(
  applicantId: string,
  slotId: string | null,
  interviewLink?: string | null
) {
  const [updated] = await db
    .update(recruitApplicants)
    .set({
      slotId,
      ...(interviewLink !== undefined ? { interviewLink } : {}),
    })
    .where(eq(recruitApplicants.id, applicantId))
    .returning();
  return updated;
}

/**
 * 여러 지원자를 **서로 다른 슬롯**에 한 번에 배정한다.
 *
 * 왜 일괄인가: 표 한 장을 붙여넣으면 70명이 15개 슬롯으로 흩어진다. 한 명씩 보내면 요청이
 * 70번이고, 중간에 하나가 실패하면 절반만 배정된 채로 끝난다 — 어디까지 들어갔는지 아무도 모른다.
 *
 * `CASE` 한 방으로 쓰는 이유는 슬롯마다 UPDATE 를 나누면 슬롯 수만큼 왕복이 생기기 때문이다.
 * 한 문장이라 전부 반영되거나 전부 안 되거나 둘 중 하나다.
 *
 * 호출부는 **미리 기수를 확인해야 한다** — 여기서는 넘어온 id 를 그대로 믿는다(규칙 #6).
 */
export async function bulkAssignSlots(
  cohortId: string,
  assignments: { applicantId: string; slotId: string | null }[]
) {
  if (assignments.length === 0) return [];

  // 같은 지원자가 두 번 오면 CASE 의 뒤엣것이 이기는데, 그건 SQL 이 정하는 순서라 예측이 안 된다.
  // 마지막 지정을 남기고 접는다(파서도 같은 규칙이다).
  const byApplicant = new Map<string, string | null>();
  for (const a of assignments) byApplicant.set(a.applicantId, a.slotId);

  const ids = [...byApplicant.keys()];
  const cases = sql.join(
    [...byApplicant.entries()].map(
      ([applicantId, slotId]) =>
        sql`when ${recruitApplicants.id} = ${applicantId}::uuid then ${slotId}::uuid`
    ),
    sql` `
  );

  return db
    .update(recruitApplicants)
    .set({ slotId: sql`case ${cases} else ${recruitApplicants.slotId} end` })
    // 기수로 한 번 더 좁힌다. 호출부가 확인하지만, 이 한 줄이 있으면 검사가 빠진 새 호출부가
    // 생겨도 남의 기수 지원자를 옮기지는 못한다.
    .where(and(eq(recruitApplicants.cohortId, cohortId), inArray(recruitApplicants.id, ids)))
    .returning({ id: recruitApplicants.id, name: recruitApplicants.name, slotId: recruitApplicants.slotId });
}

export async function updateApplicantNearStation(id: string, nearStation: string) {
  const [updated] = await db
    .update(recruitApplicants)
    .set({ nearStation })
    .where(eq(recruitApplicants.id, id))
    .returning();
  return updated;
}

export interface ReviewMarkState {
  reviewMark: ReviewMark | null;
  /** '다른 팀' 표시에만 붙는 갈 팀. 안 고를 수 있다(null = 팀 미정). */
  reviewMoveTeam: string | null;
}

/**
 * 최종 검토(5번)에서 팀장단이 붙이는 의견 표시. `mark` 가 `null` 이면 표시를 지운다.
 *
 * 상태(status)를 건드리지 않는다 — 이것은 결정이 아니라 회장단에게 넘길 의견이다
 * (review-marks.ts 머리말). 그래서 상태 전이 가드도 태우지 않는다.
 *
 * 갈 팀은 **여기서 정리한다**(`normalizeMoveTeam`): 표시가 'move' 가 아니면 무엇이 넘어왔든
 * null 이다. 호출부가 지워 주기를 기대하면 새 호출부 하나가 빠뜨리는 순간 유령 목적지가 남는다.
 *
 * 기수로 한 번 더 좁힌다: 호출부가 기수를 확인하지만, 이 한 줄이 있으면 검사가 빠진 새 호출부가
 * 생겨도 남의 기수 지원자에 표시를 남기지는 못한다(bulkAssignSlots 와 같은 이유).
 */
export async function setReviewMark(
  cohortId: string,
  id: string,
  mark: ReviewMark | null,
  moveTeam?: string | null
): Promise<{ before: ReviewMarkState; after: ReviewMarkState } | null> {
  // 바꾸기 **전** 값도 남긴다 — 검토 회의에서 "누가 이걸 지웠지"를 되짚을 때 새 값만
  // 있으면 아무 말도 못 한다(규칙 #4). 읽기와 쓰기를 같은 트랜잭션에 두는 이유는
  // setAttendance 와 같다: 팀장단이 다 같이 열어 놓고 누르는 화면이라 사이가 벌어지면
  // 옆 사람이 방금 바꾼 값을 못 본 채 이전 값으로 기록한다.
  const after: ReviewMarkState = {
    reviewMark: mark,
    reviewMoveTeam: normalizeMoveTeam(mark, moveTeam),
  };
  return db.transaction(async (tx) => {
    const scope = and(eq(recruitApplicants.id, id), eq(recruitApplicants.cohortId, cohortId));
    const [found] = await tx
      .select({
        reviewMark: recruitApplicants.reviewMark,
        reviewMoveTeam: recruitApplicants.reviewMoveTeam,
      })
      .from(recruitApplicants)
      .where(scope)
      .for('update');
    if (!found) return null;

    await tx.update(recruitApplicants).set(after).where(scope);
    return { before: found, after };
  });
}

export async function updateApplicantTeam(id: string, assignedTeam: string | null) {
  const [updated] = await db
    .update(recruitApplicants)
    .set({ assignedTeam })
    .where(eq(recruitApplicants.id, id))
    .returning();
  return updated;
}

export async function bulkUpdateApplicantTeam(ids: string[], assignedTeam: string | null) {
  if (ids.length === 0) return [];
  return db
    .update(recruitApplicants)
    .set({ assignedTeam })
    .where(inArray(recruitApplicants.id, ids))
    .returning();
}

/**
 * 같은 기수에 같은 이름+전화번호로 이미 접수된 지원서를 찾는다.
 * 공개 접수 폼은 두 번 누르거나 새로고침하면 그대로 한 건 더 들어가고, 그러면 심사 목록에
 * 같은 사람이 두 번 뜨고 결과 조회도 어느 쪽을 볼지 모호해진다.
 */
export async function findApplicantInCohort(cohortId: string, name: string, phone: string) {
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const [found] = await db
    .select({ id: recruitApplicants.id })
    .from(recruitApplicants)
    .where(
      and(
        eq(recruitApplicants.cohortId, cohortId),
        eq(recruitApplicants.name, name.trim()),
        eq(recruitApplicants.phone, cleanPhone)
      )
    )
    .limit(1);
  return found ?? null;
}

/** 공개 지원 폼이 채우는 값들 — 재제출 때 통째로 갈아 끼우는 범위이기도 하다. */
export interface ApplicantSubmission {
  cohortId: string;
  name: string;
  phone: string;
  gender?: string | null;
  birthDate?: string | null;
  school?: string | null;
  department?: string | null;
  email?: string | null;
  applyRoute?: string | null;
  otherActivities?: string | null;
  expectedFrequency?: string | null;
  wishTeam1?: string | null;
  wishTeam2?: string | null;
  nearStation?: string | null;
  otAttend?: string | null;
  remoteInterviewWish?: string | null;
  essayIntro?: string | null;
  essayValues?: string | null;
  essayValuesTopic?: string | null;
  englishName?: string | null;
}

export interface SubmissionOutcome {
  applicantId: string;
  /** 기존 지원서를 갈아 끼웠는가(= 중복 제출이었는가). */
  replaced: boolean;
  /** 갈아 끼우기 직전의 상태 — 심사가 이미 진행된 뒤였는지 감사 로그에 남긴다. */
  previousStatus: RecruitStatus | null;
  /** 갈아 끼울 때 이미 매겨져 있던 점수 개수. 0 이 아니면 채점자가 읽은 내용이 바뀐 것이다. */
  previousScoreCount: number;
  /**
   * 재제출이 **연락받을 주소를 바꿨을 때** 직전 주소. 안 바뀌었으면 null.
   *
   * 이 값을 돌려주는 이유는 하나다 — 그 주소로 "바뀌었다"고 알리기 위해서다(호출부가 보낸다).
   * **저장하지 않는다**: audit_logs 는 기수 폐기(`recruit/purge`) 범위 밖이라, 여기 주소를
   * 복사하면 폐기해도 사본이 남는다(아래 재제출 audit 주석과 같은 이유).
   */
  replacedEmail: string | null;
}

/**
 * 지원서를 접수한다 — **같은 기수에 같은 사람이 다시 내면 마지막 지원서만 남는다.**
 *
 * 왜 거절이 아니라 덮어쓰기인가: 예전에는 두 번째 제출을 409 로 막고 "고치려면 운영진에게
 * 문의하세요"라고 했다. 그런데 지원자가 다시 내는 이유는 대개 **오타·빠뜨린 문항을 고치려는
 * 것**이고, 그때마다 운영진이 대신 고쳐 줘야 했다. 사용자 지시로 마지막 것을 남긴다.
 *
 * **행을 지우고 새로 만들지 않고 제자리에서 갈아 끼운다.** 면접 배정(`slot_id`)·점수·메모·쪽지는
 * 전부 지원자 id 를 물고 있어서, 새 행을 만들면 그것들이 통째로 끊긴다. 심사 진행 상태
 * (`status`·`review_mark`)도 지원서 내용이 아니라 **운영진이 만든 값**이라 건드리지 않는다.
 *
 * `assigned_team` 은 조건부다: 운영진이 손대지 않아 아직 1지망과 같을 때만 새 1지망을 따라간다.
 * 회장단이 이미 다른 팀으로 옮겨 놨다면 재제출이 그 결정을 되돌리면 안 된다.
 *
 * 기수 행을 `FOR UPDATE` 로 잠그고 한 트랜잭션에서 처리한다: 잠그지 않으면 제출 버튼을 두 번
 * 빠르게 눌렀을 때 양쪽이 "없다"를 보고 **두 행을 만든다**. 중복 검사가 곧 도배 방어이기도 해서
 * (rate-limit.ts recruitApply 주석) 이 구멍은 그냥 두면 안 된다. 기수당 접수는 많아야 수백 건이라
 * 직렬화 비용은 없는 것이나 같다.
 */
export async function submitApplicant(input: ApplicantSubmission): Promise<SubmissionOutcome | null> {
  const cleanPhone = input.phone.replace(/[^0-9]/g, '');
  const cleanName = input.name.trim();

  const values = {
    gender: input.gender ?? null,
    birthDate: input.birthDate ?? null,
    school: input.school ?? null,
    department: input.department ?? null,
    email: input.email ?? null,
    applyRoute: input.applyRoute ?? null,
    otherActivities: input.otherActivities ?? null,
    expectedFrequency: input.expectedFrequency ?? null,
    wishTeam1: input.wishTeam1 ?? null,
    wishTeam2: input.wishTeam2 ?? null,
    nearStation: input.nearStation ?? null,
    otAttend: input.otAttend ?? null,
    remoteInterviewWish: input.remoteInterviewWish ?? null,
    essayIntro: input.essayIntro ?? null,
    essayValues: input.essayValues ?? null,
    essayValuesTopic: input.essayValuesTopic ?? null,
    englishName: input.englishName ?? null,
  };

  return db.transaction(async (tx) => {
    // 같은 기수의 접수를 한 줄로 세운다(위 주석 — 두 번 누르기 경합).
    await tx
      .select({ id: recruitCohorts.id })
      .from(recruitCohorts)
      .where(eq(recruitCohorts.id, input.cohortId))
      .for('update');

    const [existing] = await tx
      .select({
        id: recruitApplicants.id,
        status: recruitApplicants.status,
        assignedTeam: recruitApplicants.assignedTeam,
        wishTeam1: recruitApplicants.wishTeam1,
        // 재제출이 연락받을 주소를 바꿨는지 보려고 읽는다(아래 주석).
        email: recruitApplicants.email,
      })
      .from(recruitApplicants)
      .where(
        and(
          eq(recruitApplicants.cohortId, input.cohortId),
          eq(recruitApplicants.name, cleanName),
          eq(recruitApplicants.phone, cleanPhone)
        )
      )
      .limit(1);

    if (!existing) {
      const [created] = await tx
        .insert(recruitApplicants)
        .values({
          cohortId: input.cohortId,
          name: cleanName,
          phone: cleanPhone,
          ...values,
          assignedTeam: input.wishTeam1 ?? null, // 초기 배정팀은 1지망 팀으로 설정
          status: 'received',
        })
        .returning({ id: recruitApplicants.id });
      if (!created) return null;
      return { applicantId: created.id, replaced: false, previousStatus: null, previousScoreCount: 0, replacedEmail: null };
    }

    // 운영진이 배정팀을 손대지 않았을 때만 새 1지망을 따라간다(위 주석).
    const staffMovedTeam = existing.assignedTeam !== existing.wishTeam1;
    const scored = await tx
      .select({ id: recruitScores.id })
      .from(recruitScores)
      .where(eq(recruitScores.applicantId, existing.id));

    // ── 연락받을 주소(이메일) ────────────────────────────────────────────
    // 이 폼은 비로그인이고 신원 확인이 **이름+전화뿐**이다. 그 둘을 아는 사람이 재제출하면
    // 이메일까지 갈아 끼울 수 있고, 그러면 결과 안내 메일이 그 사람에게 간다(보안 QA 2026-08-26).
    // 덮어쓰기 정책 자체는 그대로 둔다(사용자 결정) — 대신 두 가지를 붙인다.
    //  ① 빈 값으로는 지우지 않는다. 지원서 양식에서 이메일 문항을 끄면(결정 146) 재제출마다
    //     null 이 덮어써서 보낼 주소가 조용히 사라진다. 이건 방어 이전에 그냥 버그다.
    //  ② 주소가 실제로 **바뀌면** 직전 주소를 호출부에 돌려준다 → 그쪽으로 알림이 나간다.
    //     막지 못하는 자리(오타 수정과 구분할 방법이 없다)라 **본인이 즉시 알게** 만든다 —
    //     회장단 권한 변경 알림이 행위자까지 포함해 보내는 것과 같은 발상이다(auth/operators.ts).
    const previousEmail = (existing.email ?? '').trim();
    const nextEmail = (input.email ?? '').trim();
    const emailChanged =
      previousEmail !== '' && nextEmail !== '' && previousEmail.toLowerCase() !== nextEmail.toLowerCase();

    await tx
      .update(recruitApplicants)
      .set({
        ...values,
        ...(nextEmail ? {} : { email: existing.email ?? null }), // ① 빈 값으로 지우지 않는다
        ...(staffMovedTeam ? {} : { assignedTeam: input.wishTeam1 ?? null }),
      })
      .where(eq(recruitApplicants.id, existing.id));

    return {
      applicantId: existing.id,
      replaced: true,
      previousStatus: existing.status as RecruitStatus,
      previousScoreCount: scored.length,
      replacedEmail: emailChanged ? previousEmail : null,
    };
  });
}

/**
 * 면접 출결(불참/되돌리기)을 기록하고 **그 결과 상태**를 돌려준다.
 *
 * 되돌리기의 도착지는 고정값이 아니라 **면접 점수 개수에서 다시 계산**한다
 * (`attendanceRevertTarget` — 왜 그래야 하는지는 그 함수 주석에 있다).
 *
 * 세는 것과 쓰는 것을 **같은 트랜잭션**에 둔다: 면접 콘솔은 여러 면접관이 동시에 여는 화면이라,
 * 세고 나서 쓰는 사이에 옆 면접관이 점수를 저장하면 방금 들어온 점수를 못 본 채 '서류 합격'으로
 * 덮어쓴다(`recordScore` 가 상태 전이를 같은 트랜잭션에서 하는 것과 같은 이유).
 */
export async function setAttendance(
  applicantId: string,
  noshow: boolean
): Promise<{ before: RecruitStatus; after: RecruitStatus } | null> {
  return db.transaction(async (tx) => {
    const [app] = await tx
      .select({ status: recruitApplicants.status })
      .from(recruitApplicants)
      .where(eq(recruitApplicants.id, applicantId));
    if (!app) return null;

    let next: RecruitStatus;
    if (noshow) {
      next = 'interview_noshow';
    } else {
      const scores = await tx
        .select({ id: recruitScores.id })
        .from(recruitScores)
        .where(and(eq(recruitScores.applicantId, applicantId), eq(recruitScores.stage, 'interview')));
      next = attendanceRevertTarget(scores.length);
    }

    await tx.update(recruitApplicants).set({ status: next }).where(eq(recruitApplicants.id, applicantId));
    return { before: app.status as RecruitStatus, after: next };
  });
}
