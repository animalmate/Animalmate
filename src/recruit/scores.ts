// F9 신입 모집 채점(서류/면접) 서비스
// 스펙: docs/09-RECRUIT-DESIGN.md §2, §3

import { db } from '../db/client';
import { recruitScores, recruitApplicants } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { nextStatusOnScoreChange, RecruitStatus } from './status';
import { validateScore } from './score-rules';

export { validateScore };

/**
 * 점수를 저장하고 **그 결과 지원자의 상태**를 돌려준다(면접 단계만 상태가 바뀐다).
 *
 * 상태를 돌려주는 이유: 화면이 저장 직후 목록 전체를 다시 받지 않아도 딱지를 고칠 수 있다.
 * 예전에는 상태 하나를 알기 위해 기수 전체(자기소개서 전문 포함)를 다시 받았다.
 */
export async function recordScore(
  applicantId: string,
  scorerUserId: string,
  stage: 'document' | 'interview',
  score: number,
  comment?: string | null
): Promise<{ applicantStatus: RecruitStatus | null }> {
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
    if (stage !== 'interview') return { applicantStatus: null };

    const [app] = await tx
      .select({ status: recruitApplicants.status })
      .from(recruitApplicants)
      .where(eq(recruitApplicants.id, applicantId));

    if (!app) return { applicantStatus: null };

    const interviewScores = await tx
      .select({ id: recruitScores.id })
      .from(recruitScores)
      .where(
        and(eq(recruitScores.applicantId, applicantId), eq(recruitScores.stage, 'interview'))
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
    return { applicantStatus: newStatus };
  });
}

/**
 * **내가 매긴** 점수 한 건을 지운다(scorerUserId 로 좁혀 남의 기록은 건드리지 못한다).
 *
 * 왜 필요한가: 면접 콘솔은 옆 사람 차례에 잘못 눌러 엉뚱한 지원자를 채점하기 쉬운 화면이다.
 * 덮어쓰기(recordScore)로는 "점수를 매기지 않았다"는 원래 사실로 되돌릴 수 없다 — 0점을 넣으면
 * 0점을 준 것이 되고, 상태도 면접 완료로 남는다. 지우는 길이 없으면 회장단이 DB 를 직접 손대야 했다.
 *
 * 저장과 같은 모양으로 **결과 상태를 돌려준다** — 화면이 명단을 통째로 다시 받지 않고 딱지만 고친다.
 * 마지막 면접 점수를 지우면 nextStatusOnScoreChange 가 interview_done → doc_pass 로 되돌린다.
 */
export async function deleteScore(
  applicantId: string,
  scorerUserId: string,
  stage: 'document' | 'interview'
): Promise<{ applicantStatus: RecruitStatus | null }> {
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

    if (stage !== 'interview') return { applicantStatus: null };

    const [app] = await tx
      .select({ status: recruitApplicants.status })
      .from(recruitApplicants)
      .where(eq(recruitApplicants.id, applicantId));

    if (!app) return { applicantStatus: null };

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
    return { applicantStatus: newStatus };
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
