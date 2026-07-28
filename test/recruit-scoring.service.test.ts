import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray, like } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { users, recruitCohorts, recruitApplicants, recruitScores, screenNotes, auditLogs } from '@/db/schema';
import { recordScore, deleteScore, getScoresForCohort } from '@/recruit/scores';
import { aggregateScoresByApplicant } from '@/recruit/aggregate';
import { purgeCohortApplicants, PurgeNotAllowedError } from '@/recruit/purge';
import { listApplicantsByIds } from '@/recruit/applicants';
import { buildNoteKey } from '@/recruit/note-keys';
import { TEST_DATABASE_URL } from './db-url';

const suite = describe;

const COHORT_LABEL = 'QA-SCORING-TEST기수';
const OTHER_COHORT_LABEL = 'QA-SCORING-다른기수';
const EMAILS = ['qa-scorer-1@example.invalid', 'qa-scorer-2@example.invalid', 'qa-scorer-3@example.invalid'];

// 단위 테스트는 규칙을 베껴 쓰기 쉽다. 여기서는 실제 서비스 함수를 실 DB 에 대고 돌려
// "면접 점수를 넣으면 상태가 바뀐다"가 진짜로 일어나는지 확인한다.
suite('모집 채점 — 자동 상태 전이·집계·폐기 (실 DB)', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let cohortId: string;
  let otherCohortId: string;
  let scorers: string[] = [];

  async function cleanup() {
    const olds = await db
      .select({ id: recruitCohorts.id })
      .from(recruitCohorts)
      .where(inArray(recruitCohorts.label, [COHORT_LABEL, OTHER_COHORT_LABEL]));
    for (const c of olds) {
      await db.delete(screenNotes).where(like(screenNotes.contextKey, `recruit:${c.id}:%`));
      await db.delete(auditLogs).where(eq(auditLogs.targetId, c.id));
      await db.delete(recruitCohorts).where(eq(recruitCohorts.id, c.id)); // applicants/scores 는 cascade
    }
    await db.delete(users).where(inArray(users.email, EMAILS));
  }

  /** 상태를 지정해 지원자 한 명을 만든다. 기수를 주지 않으면 기본 기수에 넣는다. */
  async function makeApplicant(
    name: string,
    status: 'received' | 'doc_pass' | 'final_pass',
    inCohortId?: string
  ) {
    const [a] = await db
      .insert(recruitApplicants)
      .values({
        cohortId: inCohortId ?? cohortId,
        name,
        phone: `0100000${Math.floor(Math.random() * 9000 + 1000)}`,
        status,
      })
      .returning();
    return a!.id;
  }

  const statusOf = async (id: string) => {
    const [a] = await db.select({ status: recruitApplicants.status }).from(recruitApplicants).where(eq(recruitApplicants.id, id));
    return a?.status;
  };

  beforeAll(async () => {
    sql = postgres(TEST_DATABASE_URL, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup(); // 이전 크래시 잔여 데이터 방지(멱등)

    const created = await db.insert(users).values(EMAILS.map((email, i) => ({ email, name: `QA채점자${i + 1}` }))).returning();
    scorers = created.map((u) => u.id);
    const [c] = await db.insert(recruitCohorts).values({ label: COHORT_LABEL, createdBy: scorers[0]! }).returning();
    cohortId = c!.id;
    // 기수 범위 검증용 — 일괄 확정이 다른 기수로 새는지 보려면 기수가 둘 있어야 한다.
    const [other] = await db
      .insert(recruitCohorts)
      .values({ label: OTHER_COHORT_LABEL, createdBy: scorers[0]! })
      .returning();
    otherCohortId = other!.id;
  });

  afterAll(async () => {
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  // 일괄 확정(bulk_status)은 지원자 id 목록만 받는다. 기수로 좁히지 않으면 조작된 요청이
  // 화면에서 고른 기수 밖의 사람까지 최종 합격으로 바꿀 수 있다(규칙 #6).
  it('기수를 지정하면 다른 기수 지원자는 조회에서 빠진다', async () => {
    const mine = await makeApplicant('우리기수사람', 'doc_pass');
    const theirs = await makeApplicant('다른기수사람', 'doc_pass', otherCohortId);

    const scoped = await listApplicantsByIds([mine, theirs], cohortId);
    expect(scoped.map((a) => a.id)).toEqual([mine]);

    // 범위를 주지 않으면 둘 다 나온다 — 그래서 라우트가 cohortId 를 반드시 넘긴다.
    const unscoped = await listApplicantsByIds([mine, theirs]);
    expect(unscoped.map((a) => a.id).sort()).toEqual([mine, theirs].sort());
  });

  it('서류 합격자에게 면접 점수를 매기면 면접 완료로 자동 전환된다', async () => {
    const id = await makeApplicant('전환테스트', 'doc_pass');
    await recordScore(id, scorers[0]!, 'interview', 8.5, '침착함');
    expect(await statusOf(id)).toBe('interview_done');
  });

  it('면접관이 여럿일 때 한 명만 점수를 지워도 면접 완료가 유지된다', async () => {
    const id = await makeApplicant('부분삭제', 'doc_pass');
    await recordScore(id, scorers[0]!, 'interview', 7.0);
    await recordScore(id, scorers[1]!, 'interview', 8.0);
    expect(await statusOf(id)).toBe('interview_done');

    await deleteScore(id, scorers[0]!, 'interview');
    // 아직 한 명의 점수가 남아 있다 — 면접을 봤다는 사실은 그대로다.
    expect(await statusOf(id)).toBe('interview_done');
  });

  it('면접 점수가 0개가 되면 서류 합격 상태로 되돌아간다', async () => {
    const id = await makeApplicant('전량삭제', 'doc_pass');
    await recordScore(id, scorers[0]!, 'interview', 7.0);
    expect(await statusOf(id)).toBe('interview_done');

    await deleteScore(id, scorers[0]!, 'interview');
    expect(await statusOf(id)).toBe('doc_pass');
  });

  it('최종 결정된 지원자는 면접 점수를 지워도 상태가 되돌아가지 않는다', async () => {
    // 결정을 뒤집는 것은 채점의 부작용이 아니라 회장단의 행위여야 한다.
    const id = await makeApplicant('최종합격자', 'final_pass');
    await recordScore(id, scorers[0]!, 'interview', 9.0);
    expect(await statusOf(id)).toBe('final_pass');

    await deleteScore(id, scorers[0]!, 'interview');
    expect(await statusOf(id)).toBe('final_pass');
  });

  it('서류 점수는 상태를 건드리지 않는다', async () => {
    const id = await makeApplicant('서류점수', 'received');
    await recordScore(id, scorers[0]!, 'document', 6.5);
    expect(await statusOf(id)).toBe('received');
  });

  it('집계가 평균·최고·최저·표본 부족을 실제 저장값대로 낸다', async () => {
    const three = await makeApplicant('삼인채점', 'received');
    const one = await makeApplicant('일인채점', 'received');

    await recordScore(three, scorers[0]!, 'document', 8.0);
    await recordScore(three, scorers[1]!, 'document', 9.0);
    await recordScore(three, scorers[2]!, 'document', 7.0);
    await recordScore(one, scorers[0]!, 'document', 6.0);

    const scores = await getScoresForCohort(cohortId);
    const agg = aggregateScoresByApplicant([three, one], scores);

    expect(agg[three]!.docScoreAvg).toBe(8.0);
    expect(agg[three]!.docScoreMin).toBe(7.0);
    expect(agg[three]!.docScoreMax).toBe(9.0);
    expect(agg[three]!.docScorerCount).toBe(3);
    expect(agg[three]!.isDocSampleDeficient).toBe(false);

    // 3명 미만이면 평균을 믿을 수 없다고 표시해야 한다.
    expect(agg[one]!.docScorerCount).toBe(1);
    expect(agg[one]!.isDocSampleDeficient).toBe(true);
  });

  it('같은 사람이 다시 채점하면 점수가 쌓이지 않고 덮어써진다', async () => {
    const id = await makeApplicant('재채점', 'received');
    await recordScore(id, scorers[0]!, 'document', 5.0);
    await recordScore(id, scorers[0]!, 'document', 9.5);

    const rows = await db.select().from(recruitScores).where(eq(recruitScores.applicantId, id));
    expect(rows).toHaveLength(1);
    expect(parseFloat(rows[0]!.score)).toBe(9.5);
  });

  it('0.5 단위가 아닌 점수는 저장되지 않는다', async () => {
    const id = await makeApplicant('잘못된점수', 'received');
    await expect(recordScore(id, scorers[0]!, 'document', 7.3)).rejects.toThrow();
    const rows = await db.select().from(recruitScores).where(eq(recruitScores.applicantId, id));
    expect(rows).toHaveLength(0);
  });

  // 폐기는 지원자를 전부 지우므로 반드시 마지막에 돈다.
  it('폐기하면 지원자·점수·공용 메모지가 사라지고 익명 집계만 남는다', async () => {
    const noteKey = buildNoteKey(cohortId, 'doc', '1팀');
    await db.insert(screenNotes).values({ contextKey: noteKey, content: '홍길동 지각함', updatedBy: scorers[0]! });

    const before = await db.select({ id: recruitApplicants.id }).from(recruitApplicants).where(eq(recruitApplicants.cohortId, cohortId));
    expect(before.length).toBeGreaterThan(0);

    const stats = await purgeCohortApplicants(cohortId, scorers[0]!);
    expect(stats.totalApplicants).toBe(before.length);

    const after = await db.select({ id: recruitApplicants.id }).from(recruitApplicants).where(eq(recruitApplicants.cohortId, cohortId));
    expect(after).toHaveLength(0);

    // 메모지에는 지원자 실명이 적힌다 — 지원서만 지우고 남기면 "모두 폐기" 고지를 어긴다.
    const notes = await db.select().from(screenNotes).where(eq(screenNotes.contextKey, noteKey));
    expect(notes).toHaveLength(0);

    const [cohort] = await db.select().from(recruitCohorts).where(eq(recruitCohorts.id, cohortId));
    expect(cohort!.archivedStats).toBeTruthy();
    expect(cohort!.closedAt).toBeTruthy();
  });

  it('이미 폐기한 기수를 다시 폐기하면 막는다 — 남은 집계가 지워지지 않게', async () => {
    const [before] = await db.select({ stats: recruitCohorts.archivedStats }).from(recruitCohorts).where(eq(recruitCohorts.id, cohortId));

    await expect(purgeCohortApplicants(cohortId, scorers[0]!)).rejects.toBeInstanceOf(PurgeNotAllowedError);

    const [after] = await db.select({ stats: recruitCohorts.archivedStats }).from(recruitCohorts).where(eq(recruitCohorts.id, cohortId));
    expect(after!.stats).toEqual(before!.stats);
  });
});
