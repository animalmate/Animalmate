// F9 모집 종료 후 지원자 PII 일괄 데이터 폐기 서비스
// 스펙: docs/09-RECRUIT-DESIGN.md §8
// 2단계 확인 후 지원자 인적사항, 점수, 메모 전량 Hard Delete. 익명 집계 통계만 둔다.

import { db } from '../db/client';
import { recruitCohorts, recruitApplicants, recruitScores } from '../db/schema';
import { eq } from 'drizzle-orm';
import { recordAudit, buildAuditEntry } from '../auth/audit';
import { purgeBlockReason } from './purge-rules';

/** 폐기를 실행하면 안 되는 상황(없는 기수·이미 폐기됨). 라우트에서 4xx 로 돌려준다. */
export class PurgeNotAllowedError extends Error {}

const avg = (nums: number[]): number | null =>
  nums.length > 0 ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : null;

export async function purgeCohortApplicants(cohortId: string, actorUserId: string) {
  return db.transaction(async (tx) => {
    // 0. 폐기해도 되는 기수인지 먼저 확인한다.
    //    - 없는 기수를 지우면 아무것도 안 지우고 success 를 돌려줘서, 엉뚱한 id 를 넣은 걸 모른 채 넘어간다.
    //    - 이미 폐기한 기수를 또 폐기하면 지원자가 0명이라 archived_stats 가 전부 0 으로 덮여,
    //      삭제 후 유일하게 남는 집계가 사라진다(복구 불가). 확인 문구만 통과하면 벌어진다.
    const [cohort] = await tx
      .select({ id: recruitCohorts.id, label: recruitCohorts.label, archivedStats: recruitCohorts.archivedStats })
      .from(recruitCohorts)
      .where(eq(recruitCohorts.id, cohortId));

    const blocked = purgeBlockReason(cohort);
    if (blocked) throw new PurgeNotAllowedError(blocked);

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

    const docAvg = avg(scores.filter((s) => s.stage === 'document').map((s) => parseFloat(s.score)));
    const intAvg = avg(scores.filter((s) => s.stage === 'interview').map((s) => parseFloat(s.score)));

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
      buildAuditEntry({
        actorUserId,
        action: 'recruit.purge',
        targetTable: 'recruit_cohorts',
        targetId: cohortId,
        after: archivedStats,
        severity: 'high',
      })
    );

    return archivedStats;
  });
}
