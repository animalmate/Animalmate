// F9 신입 모집 지원자 CRUD 및 관리 서비스
import { db } from '../db/client';
import { recruitApplicants } from '../db/schema';
import { eq, and, inArray, asc } from 'drizzle-orm';
import { ApplicantImportInput } from './csv';
import { RecruitStatus } from './status';

export async function bulkCreateApplicants(
  cohortId: string,
  uploadedBy: string,
  applicants: ApplicantImportInput[]
) {
  if (applicants.length === 0) return [];

  const values = applicants.map((app) => ({
    cohortId,
    uploadedBy,
    name: app.name.trim(),
    phone: app.phone.replace(/[^0-9]/g, ''),
    gender: app.gender,
    birthDate: app.birthDate,
    school: app.school,
    department: app.department,
    email: app.email,
    applyRoute: app.applyRoute,
    otherActivities: app.otherActivities,
    expectedFrequency: app.expectedFrequency,
    wishTeam1: app.wishTeam1,
    wishTeam2: app.wishTeam2,
    nearStation: app.nearStation,
    otAttend: app.otAttend,
    remoteInterviewWish: app.remoteInterviewWish,
    essayIntro: app.essayIntro,
    essayValues: app.essayValues,
    essayValuesTopic: app.essayValuesTopic,
    englishName: app.englishName,
    status: 'received' as const,
  }));

  return db.insert(recruitApplicants).values(values).returning();
}

export async function listApplicantsByCohort(cohortId: string) {
  return db
    .select()
    .from(recruitApplicants)
    .where(eq(recruitApplicants.cohortId, cohortId))
    .orderBy(asc(recruitApplicants.name));
}

/**
 * 목록·배정·집계 화면용 축약 조회. 자기소개서 본문을 빼면 50명 기준 60.9KB → 8.9KB 다.
 * 지원서 전문을 읽는 화면(서류 심사·면접 콘솔)만 위 전체 조회를 쓴다.
 */
export async function listApplicantsByCohortSlim(cohortId: string) {
  return db
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
      slotId: recruitApplicants.slotId,
      interviewLink: recruitApplicants.interviewLink,
      nearStation: recruitApplicants.nearStation,
      remoteInterviewWish: recruitApplicants.remoteInterviewWish,
    })
    .from(recruitApplicants)
    .where(eq(recruitApplicants.cohortId, cohortId))
    .orderBy(asc(recruitApplicants.name));
}

export async function getApplicantById(id: string) {
  const [found] = await db
    .select()
    .from(recruitApplicants)
    .where(eq(recruitApplicants.id, id));
  return found ?? null;
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

export async function updateApplicantNearStation(id: string, nearStation: string) {
  const [updated] = await db
    .update(recruitApplicants)
    .set({ nearStation })
    .where(eq(recruitApplicants.id, id))
    .returning();
  return updated;
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

export async function createSingleApplicant(input: {
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
}) {
  const cleanPhone = input.phone.replace(/[^0-9]/g, '');
  const [created] = await db
    .insert(recruitApplicants)
    .values({
      cohortId: input.cohortId,
      name: input.name.trim(),
      phone: cleanPhone,
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
      assignedTeam: input.wishTeam1 ?? null, // 초기 배정팀은 1지망 팀으로 설정
      nearStation: input.nearStation ?? null,
      otAttend: input.otAttend ?? null,
      remoteInterviewWish: input.remoteInterviewWish ?? null,
      essayIntro: input.essayIntro ?? null,
      essayValues: input.essayValues ?? null,
      essayValuesTopic: input.essayValuesTopic ?? null,
      englishName: input.englishName ?? null,
      status: 'received',
    })
    .returning();
  return created;
}

