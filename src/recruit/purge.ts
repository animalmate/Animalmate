// F9 모집 종료 후 지원자 PII 일괄 데이터 폐기 서비스
// 스펙: docs/09-RECRUIT-DESIGN.md §8
// 2단계 확인 후 지원자 인적사항, 점수, 메모 전량 Hard Delete. 익명 집계 통계만 둔다.

import { db } from '../db/client';
import { recruitCohorts, recruitApplicants, recruitScores } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { recordAudit } from '../auth/audit';

export async function purgeCohortApplicants(cohortId: string, actorUserId: string) {
  return db.transaction(async (tx) => {
    // 1. 해당 기수의 지원자 및 점수 통계 산출 (익명 집계)
    const applicants = await tx
      .select({ id: recruitApplicants.id, status: recruitApplicants.status })
      .from(recruitApplicants)
      .where(eq(recruitApplicants.cohortId, cohortId));

    const totalCount = applicants.length;
    const docPassCount = applicants.filter((a) =>
      ['doc_pass', 'interview_done', 'interview_noshow', 'final_pass', 'final_fail'].includes(
        a.status
      )
    ).length;
    const finalPassCount = applicants.filter((a) => a.status === 'final_pass').length;

    const scores = await tx
      .select({ score: recruitScores.score, stage: recruitScores.stage })
      .from(recruitScores)
      .innerJoin(recruitApplicants, eq(recruitScores.applicantId, recruitApplicants.id))
      .where(eq(recruitApplicants.cohortId, cohortId));

    const docScores = scores.filter((s) => s.stage === 'document').map((s) => parseFloat(s.score));
    const intScores = scores.filter((s) => s.stage === 'interview').map((s) => parseFloat(s.score));

    const docAvg =
      docScores.length > 0
        ? Math.round((docScores.reduce((a, b) => a + b, 0) / docScores.length) * 10) / 10
        : null;
    const intAvg =
      intScores.length > 0
        ? Math.round((intScores.reduce((a, b) => a + b, 0) / intScores.length) * 10) / 10
        : null;

    const archivedStats = {
      totalApplicants: totalCount,
      docPassCount,
      finalPassCount,
      docScoreAvg: docAvg,
      interviewScoreAvg: intAvg,
      purgedAt: new Date().toISOString(),
    };

    // 2. 기수 테이블 closedAt 및 archivedStats 갱신
    await tx
      .update(recruitCohorts)
      .set({
        closedAt: new Date(),
        archivedStats,
      })
      .where(eq(recruitCohorts.id, cohortId));

    // 3. 지원자 테이블 Hard Delete (cascade로 slots, scores, memos 자동 삭제)
    await tx.delete(recruitApplicants).where(eq(recruitApplicants.cohortId, cohortId));

    // 4. Audit log 기록 [high]
    await recordAudit(
      tx,
      actorUserId,
      'recruit.purge',
      'recruit_cohorts',
      cohortId,
      undefined,
      archivedStats
    );

    return archivedStats;
  });
}
