// F9 신입 모집 비로그인 지원자 결과 조회 서비스
// 스펙: docs/09-RECRUIT-DESIGN.md §6-7
// 이름+전화번호 전체 정확 일치 시에만 본인 결과 표시. PII 시도 입력값 미저장.

import { db } from '../db/client';
import { recruitApplicants, recruitCohorts, recruitSlots } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { consumeRateLimit, resetRateLimit, RULES } from '../http/rate-limit';
import { lookupFailKey } from './lookup-key';
import { visibleLookupResult, type PublicStage } from './lookup-visibility';
import { pickInterviewLink } from './interview-link';
import type { RecruitStatus } from './status';

export interface PublicLookupResult {
  /** 내부 status 가 아니라 공개용 단계(lookup-visibility 가 스위치를 반영해 결정). */
  stage: PublicStage;
  schedulePublic: boolean;
  resultPublic: boolean;
  assignedTeam?: string | null;
  congratsMessage?: string | null;
  postPassNotice?: string | null;
  /** 서류 합격 안내 멘트(기수 설정). 없으면 화면이 기본 문구를 쓴다. */
  docPassMessage?: string | null;
  /** 면접 안내 사항(기수 설정) — 일시·장소·링크 밖의 준비물·유의사항. */
  interviewNotice?: string | null;
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

  // 두 상한은 서로 다른 것을 막는다.
  //  · recruitLookup(IP)      — 총량. 한 곳에서 쏟아지는 요청 자체를 막는다.
  //  · recruitLookupFail(이름) — 열거. **특정인의 전화번호를 맞히려는 반복**을 막는다.
  // 실패 카운터를 IP 로 묶으면 발표 직후 한 공인 IP 뒤 수십 명이 서로의 예산을 깎아,
  // 남의 오타 열 번에 내가 1시간 잠긴다. 대상(이름)으로 묶으면 그 충돌이 사라지고,
  // 오히려 IP 를 바꿔 가며 한 사람을 노리는 시도까지 한 통에 모여 막힌다(결정 80).
  const failKey = lookupFailKey(cleanName, process.env.SESSION_SECRET ?? '');
  await consumeRateLimit(db, RULES.recruitLookup, ip);
  await consumeRateLimit(db, RULES.recruitLookupFail, failKey);

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
    )
    // 재지원자는 이름+전화가 여러 기수에 남는다. 정렬이 없으면 어느 행이 나올지 정해지지 않아
    // 이번 기수 결과를 보러 온 사람에게 지난 기수 결과가 뜰 수 있다. 항상 최신 지원서를 본다.
    .orderBy(desc(recruitApplicants.createdAt))
    .limit(1);

  if (!applicant) {
    return null;
  }

  // 본인이 맞혔으면 그 대상의 실패 누적을 지운다(이름 단위 — 그 사람만 초기화된다).
  await resetRateLimit(db, RULES.recruitLookupFail, failKey);

  const [cohort] = await db
    .select({
      schedulePublic: recruitCohorts.schedulePublic,
      resultPublic: recruitCohorts.resultPublic,
      congratsMessage: recruitCohorts.congratsMessage,
      postPassNotice: recruitCohorts.postPassNotice,
      docPassMessage: recruitCohorts.docPassMessage,
      interviewNotice: recruitCohorts.interviewNotice,
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
    // 면접 안내 문구도 같은 스위치(showInterview)를 탄다 — 문구 자체가 "너는 면접을 본다"는
    // 사실을 알려 주므로, 공개 전에 내보내면 서류 결과가 새는 것과 같다.
    // 서류 합격 멘트는 그 단계에서만 쓴다(면접이 끝난 사람에게 '면접을 안내합니다'는 옛 이야기다).
    docPassMessage: visible.stage === 'doc_pass' ? cohort?.docPassMessage : null,
    interviewNotice: visible.showInterview ? cohort?.interviewNotice : null,
    interviewSlot: slotInfo,
    // 개인 링크 → 조 링크 순으로 고르고, 스킴 없는 주소는 절대 주소로 맞춘다
    // (규칙과 이유는 interview-link.ts 에 있다).
    interviewLink: visible.showInterview
      ? pickInterviewLink(applicant.interviewLink, slotInfo?.link)
      : null,
  };
}
