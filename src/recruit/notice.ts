// F9 신입 모집 공고, 모집 마감 스위치, 대면 장소 프리셋 및 축하 멘트 관리 서비스
import { db } from '../db/client';
import { recruitCohorts } from '../db/schema';
import { eq } from 'drizzle-orm';
import { getCohortById } from './cohorts';

export interface UpdateNoticeInput {
  noticeContent?: string | null;
  noticeImages?: string[] | null;
  congratsMessage?: string | null;
  postPassNotice?: string | null;
  /** 서류 합격자 조회 화면의 안내 멘트(비면 화면 기본 문구를 쓴다). */
  docPassMessage?: string | null;
  /** 면접 안내 사항 — 일시·장소·링크 말고 지원자가 알아야 할 것(준비물·복장·문의처). */
  interviewNotice?: string | null;
  isClosed?: boolean;
  venues?: string[] | null;
  /** 면접 당일 대기실 업무 이름들. 기수마다 다르다(src/recruit/duty-rules.ts 기본값). */
  dutyRoles?: string[] | null;
  /** 공개 지원서 양식 설정(ApplyFormConfig). 자세한 형태는 src/recruit/apply-form.ts. */
  applyForm?: unknown;
}

export async function updateCohortNoticeAndSettings(cohortId: string, input: UpdateNoticeInput) {
  const updateData: Record<string, any> = {};
  if (input.noticeContent !== undefined) updateData.noticeContent = input.noticeContent;
  if (input.noticeImages !== undefined) updateData.noticeImages = input.noticeImages;
  if (input.congratsMessage !== undefined) updateData.congratsMessage = input.congratsMessage;
  if (input.postPassNotice !== undefined) updateData.postPassNotice = input.postPassNotice;
  if (input.docPassMessage !== undefined) updateData.docPassMessage = input.docPassMessage;
  if (input.interviewNotice !== undefined) updateData.interviewNotice = input.interviewNotice;
  if (input.isClosed !== undefined) updateData.isClosed = input.isClosed;
  if (input.venues !== undefined) updateData.venues = input.venues;
  if (input.dutyRoles !== undefined) updateData.dutyRoles = input.dutyRoles;
  if (input.applyForm !== undefined) updateData.applyForm = input.applyForm;

  if (Object.keys(updateData).length === 0) return getCohortById(cohortId);

  const [updated] = await db
    .update(recruitCohorts)
    .set(updateData)
    .where(eq(recruitCohorts.id, cohortId))
    .returning();
  return updated ?? null;
}
