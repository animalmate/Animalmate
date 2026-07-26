// F9 신입 모집 채점(서류/면접) 서비스
// 스펙: docs/09-RECRUIT-DESIGN.md §2, §3

import { db } from '../db/client';
import { recruitScores, recruitApplicants } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { nextStatusOnScoreChange, RecruitStatus } from './status';

/**
 * 점수 유효성 검증: 0.0 ~ 10.0 범위, 0.5 단위
 */
export function validateScore(score: number): boolean {
  if (isNaN(score) || score < 0 || score > 10) return false;
  const doubled = score * 2;
  return Math.abs(doubled - Math.round(doubled)) < 1e-6;
}

export async function recordScore(
  applicantId: string,
  scorerUserId: string,
  stage: 'document' | 'interview',
  score: number,
  comment?: string | null
) {
  if (!validateScore(score)) {
    throw new Error('Score must be between 0.0 and 10.0 in 0.5 increments');
  }

  return db.transaction(async (tx) => {
    // 1. 점수 UPSERT (UNIQUE: applicantId, scorerUserId, stage)
    await tx
      .insert(recruitScores)
      .values({
        applicantId,
        scorerUserId,
        stage,
        score: score.toFixed(1),
        comment: comment ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [recruitScores.applicantId, recruitScores.scorerUserId, recruitScores.stage],
        set: {
          score: score.toFixed(1),
          comment: comment ?? null,
          updatedAt: new Date(),
        },
      });

    // 2. 면접 단계일 경우 자동 상태 전이 처리
    if (stage === 'interview') {
      const [app] = await tx
        .select({ status: recruitApplicants.status })
        .from(recruitApplicants)
        .where(eq(recruitApplicants.id, applicantId));

      if (app) {
        const interviewScores = await tx
          .select({ id: recruitScores.id })
          .from(recruitScores)
          .where(
            and(
              eq(recruitScores.applicantId, applicantId),
              eq(recruitScores.stage, 'interview')
            )
          );

        const newStatus = nextStatusOnScoreChange(
          app.status as RecruitStatus,
          interviewScores.length
        );

        if (newStatus !== app.status) {
          await tx
            .update(recruitApplicants)
            .set({ status: newStatus })
            .where(eq(recruitApplicants.id, applicantId));
        }
      }
    }
  });
}

export async function deleteScore(
  applicantId: string,
  scorerUserId: string,
  stage: 'document' | 'interview'
) {
  return db.transaction(async (tx) => {
    await tx
      .delete(recruitScores)
      .where(
        and(
          eq(recruitScores.applicantId, applicantId),
          eq(recruitScores.scorerUserId, scorerUserId),
          eq(recruitScores.stage, stage)
        )
      );

    if (stage === 'interview') {
      const [app] = await tx
        .select({ status: recruitApplicants.status })
        .from(recruitApplicants)
        .where(eq(recruitApplicants.id, applicantId));

      if (app) {
        const interviewScores = await tx
          .select({ id: recruitScores.id })
          .from(recruitScores)
          .where(
            and(
              eq(recruitScores.applicantId, applicantId),
              eq(recruitScores.stage, 'interview')
            )
          );

        const newStatus = nextStatusOnScoreChange(
          app.status as RecruitStatus,
          interviewScores.length
        );

        if (newStatus !== app.status) {
          await tx
            .update(recruitApplicants)
            .set({ status: newStatus })
            .where(eq(recruitApplicants.id, applicantId));
        }
      }
    }
  });
}

export async function getScoresForApplicant(applicantId: string) {
  return db
    .select()
    .from(recruitScores)
    .where(eq(recruitScores.applicantId, applicantId));
}

export async function getScoresForCohort(cohortId: string) {
  return db
    .select({
      id: recruitScores.id,
      applicantId: recruitScores.applicantId,
      scorerUserId: recruitScores.scorerUserId,
      stage: recruitScores.stage,
      score: recruitScores.score,
      comment: recruitScores.comment,
      updatedAt: recruitScores.updatedAt,
    })
    .from(recruitScores)
    .innerJoin(recruitApplicants, eq(recruitScores.applicantId, recruitApplicants.id))
    .where(eq(recruitApplicants.cohortId, cohortId));
}
