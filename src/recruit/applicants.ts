// F9 신입 모집 지원자 CRUD 및 관리 서비스
import { db } from '../db/client';
import { recruitApplicants } from '../db/schema';
import { eq, inArray, asc } from 'drizzle-orm';
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

export async function getApplicantById(id: string) {
  const [found] = await db
    .select()
    .from(recruitApplicants)
    .where(eq(recruitApplicants.id, id));
  return found ?? null;
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

