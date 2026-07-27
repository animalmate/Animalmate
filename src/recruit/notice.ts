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
  isClosed?: boolean;
  venues?: string[] | null;
  /** 공개 지원서 양식 설정(ApplyFormConfig). 자세한 형태는 src/recruit/apply-form.ts. */
  applyForm?: unknown;
}

export async function updateCohortNoticeAndSettings(cohortId: string, input: UpdateNoticeInput) {
  const updateData: Record<string, any> = {};
  if (input.noticeContent !== undefined) updateData.noticeContent = input.noticeContent;
  if (input.noticeImages !== undefined) updateData.noticeImages = input.noticeImages;
  if (input.congratsMessage !== undefined) updateData.congratsMessage = input.congratsMessage;
  if (input.postPassNotice !== undefined) updateData.postPassNotice = input.postPassNotice;
  if (input.isClosed !== undefined) updateData.isClosed = input.isClosed;
  if (input.venues !== undefined) updateData.venues = input.venues;
  if (input.applyForm !== undefined) updateData.applyForm = input.applyForm;

  if (Object.keys(updateData).length === 0) return getCohortById(cohortId);

  const [updated] = await db
    .update(recruitCohorts)
    .set(updateData)
    .where(eq(recruitCohorts.id, cohortId))
    .returning();
  return updated ?? null;
}
