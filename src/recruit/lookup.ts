// F9 신입 모집 비로그인 지원자 결과 조회 서비스
// 스펙: docs/09-RECRUIT-DESIGN.md §6-7
// 이름+전화번호 전체 정확 일치 시에만 본인 결과 표시. PII 시도 입력값 미저장.

import { db } from '../db/client';
import { recruitApplicants, recruitCohorts, recruitSlots } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { consumeRateLimit, resetRateLimit, RULES } from '../http/rate-limit';

export interface PublicLookupResult {
  status: string;
  schedulePublic: boolean;
  resultPublic: boolean;
  interviewSlot?: {
    startsAt: Date;
    durationMin: number;
    link?: string | null;
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

  // 1. 전체 조회 속도 제한 (분당 5회)
  await consumeRateLimit(db, RULES.recruitLookup, ip);

  // 2. 실패 10회 누적 차단 체크
  await consumeRateLimit(db, RULES.recruitLookupFail, ip);

  // 3. 지원자 조회 (이름 + 전화번호 정확 일치)
  const [applicant] = await db
    .select({
      id: recruitApplicants.id,
      cohortId: recruitApplicants.cohortId,
      status: recruitApplicants.status,
      slotId: recruitApplicants.slotId,
      interviewLink: recruitApplicants.interviewLink,
    })
    .from(recruitApplicants)
    .where(
      and(
        eq(recruitApplicants.name, cleanName),
        eq(recruitApplicants.phone, cleanPhone)
      )
    );

  if (!applicant) {
    // 실패 시 lookup_fail 버킷 증가 (consumeRateLimit 이미 1증가 시킴)
    return null;
  }

  // 성공 시 실패 카운터 초기화
  await resetRateLimit(db, RULES.recruitLookupFail, ip);

  // 4. 기수 공개 스위치 정보 조회
  const [cohort] = await db
    .select({
      schedulePublic: recruitCohorts.schedulePublic,
      resultPublic: recruitCohorts.resultPublic,
    })
    .from(recruitCohorts)
    .where(eq(recruitCohorts.id, applicant.cohortId));

  let slotInfo: PublicLookupResult['interviewSlot'] = null;
  if (applicant.slotId && cohort?.schedulePublic) {
    const [slot] = await db
      .select({
        startsAt: recruitSlots.startsAt,
        durationMin: recruitSlots.durationMin,
        link: recruitSlots.link,
      })
      .from(recruitSlots)
      .where(eq(recruitSlots.id, applicant.slotId));

    if (slot) {
      slotInfo = slot;
    }
  }

  return {
    status: applicant.status,
    schedulePublic: cohort?.schedulePublic ?? false,
    resultPublic: cohort?.resultPublic ?? false,
    interviewSlot: slotInfo,
    interviewLink: cohort?.schedulePublic ? applicant.interviewLink : null,
  };
}
