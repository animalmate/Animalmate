// F9 신입 모집 비로그인 지원자 결과 조회 서비스
// 스펙: docs/09-RECRUIT-DESIGN.md §6-7
// 이름+전화번호 전체 정확 일치 시에만 본인 결과 표시. PII 시도 입력값 미저장.

import { db } from '../db/client';
import { recruitApplicants, recruitCohorts, recruitSlots } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { consumeRateLimit, resetRateLimit, RULES } from '../http/rate-limit';
import { visibleLookupResult, type PublicStage } from './lookup-visibility';
import type { RecruitStatus } from './status';

export interface PublicLookupResult {
  /** 내부 status 가 아니라 공개용 단계(lookup-visibility 가 스위치를 반영해 결정). */
  stage: PublicStage;
  schedulePublic: boolean;
  resultPublic: boolean;
  assignedTeam?: string | null;
  congratsMessage?: string | null;
  postPassNotice?: string | null;
  interviewSlot?: {
    startsAt: Date;
    durationMin: number;
    link?: string | null;
    venue?: string | null;
  } | null;
  interviewLink?: string | null;
}

export async function lookupApplicantResult(
  name: string,
  phone: string,
  ip: string
): Promise<PublicLookupResult | null> {
  const cleanName = name.trim();
  const cleanPhone = phone.replace(/[^0-9]/g, '');

  if (!cleanName || !cleanPhone) {
    return null;
  }

  await consumeRateLimit(db, RULES.recruitLookup, ip);
  await consumeRateLimit(db, RULES.recruitLookupFail, ip);

  const [applicant] = await db
    .select({
      id: recruitApplicants.id,
      cohortId: recruitApplicants.cohortId,
      status: recruitApplicants.status,
      slotId: recruitApplicants.slotId,
      interviewLink: recruitApplicants.interviewLink,
      assignedTeam: recruitApplicants.assignedTeam,
      wishTeam1: recruitApplicants.wishTeam1,
    })
    .from(recruitApplicants)
    .where(
      and(
        eq(recruitApplicants.name, cleanName),
        eq(recruitApplicants.phone, cleanPhone)
      )
    );

  if (!applicant) {
    return null;
  }

  await resetRateLimit(db, RULES.recruitLookupFail, ip);

  const [cohort] = await db
    .select({
      schedulePublic: recruitCohorts.schedulePublic,
      resultPublic: recruitCohorts.resultPublic,
      congratsMessage: recruitCohorts.congratsMessage,
      postPassNotice: recruitCohorts.postPassNotice,
    })
    .from(recruitCohorts)
    .where(eq(recruitCohorts.id, applicant.cohortId));

  const schedulePublic = cohort?.schedulePublic ?? false;
  const resultPublic = cohort?.resultPublic ?? false;

  // 무엇까지 보여줄지는 순수 규칙이 정한다(단위 테스트로 고정, lookup-visibility.ts).
  const visible = visibleLookupResult(
    applicant.status as RecruitStatus,
    schedulePublic,
    resultPublic
  );

  let slotInfo: PublicLookupResult['interviewSlot'] = null;
  if (applicant.slotId && visible.showInterview) {
    const [slot] = await db
      .select({
        startsAt: recruitSlots.startsAt,
        durationMin: recruitSlots.durationMin,
        link: recruitSlots.link,
        venue: recruitSlots.venue,
      })
      .from(recruitSlots)
      .where(eq(recruitSlots.id, applicant.slotId));

    if (slot) {
      slotInfo = slot;
    }
  }

  return {
    stage: visible.stage,
    schedulePublic,
    resultPublic,
    // 배정 팀·축하 멘트·합격 후 안내는 최종 합격이 공개된 뒤에만 내보낸다.
    // (전엔 스위치와 무관하게 나가서 발표 전에 당락이 새어 나갔다.)
    assignedTeam: visible.showPassContent ? (applicant.assignedTeam || applicant.wishTeam1) : null,
    congratsMessage: visible.showPassContent ? cohort?.congratsMessage : null,
    postPassNotice: visible.showPassContent ? cohort?.postPassNotice : null,
    interviewSlot: slotInfo,
    interviewLink: visible.showInterview ? applicant.interviewLink : null,
  };
}
