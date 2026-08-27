import 'dotenv/config';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, inArray, like } from 'drizzle-orm';
import * as schema from '@/db/schema';
import {
  users,
  auditLogs,
  recruitCohorts,
  recruitApplicants,
  recruitSlots,
  recruitResultMails,
} from '@/db/schema';
import {
  previewResultMails,
  queueResultMails,
  resultMailStatus,
  runResultMailWorker,
  SwitchOffError,
} from '@/recruit/result-mails';
import { BATCH_PER_TICK } from '@/recruit/result-mail-rules';
import type { Mailer } from '@/auth/mailer';
import { TEST_DATABASE_URL } from './db-url';

const COHORT_LABEL = 'QA-MAIL-테스트기수';
const OTHER_LABEL = 'QA-MAIL-다른기수';
const BULK_LABEL = 'QA-MAIL-대량기수';
const ACTOR_EMAIL = 'qa-mail-actor@example.invalid';

/** 발송을 가로채는 메일러. 실제 SMTP 를 타지 않고 "누구에게 무엇이 갔는지"만 모은다. */
function stubMailer() {
  const sent: { to: string; subject: string; text: string }[] = [];
  const mailer: Mailer = {
    async send(mail) {
      // `GenericMail.to` 는 배열도 받는다. 여기서는 **한 통이 몇 명에게 갔는지**가 관심사라
      // 배열이면 콤마로 이어 붙여 남긴다 — 다중 수신자로 새면 그대로 눈에 띈다.
      sent.push({
        to: Array.isArray(mail.to) ? mail.to.join(',') : mail.to,
        subject: mail.subject,
        text: mail.text ?? '',
      });
    },
    async sendOtp() {
      throw new Error('이 테스트에서 OTP 는 쓰지 않는다');
    },
  };
  return { mailer, sent };
}

/** 항상 실패하는 메일러 — 재시도·failed 확정 경로용. */
function failingMailer(message = 'SMTP 연결 실패(테스트)') {
  let calls = 0;
  const mailer: Mailer = {
    async send() {
      calls += 1;
      throw new Error(message);
    },
    async sendOtp() {
      throw new Error('이 테스트에서 OTP 는 쓰지 않는다');
    },
  };
  return { mailer, calls: () => calls };
}

/**
 * F9 결과 안내 메일 — 대기열·워커를 **실 DB** 에 대고 돌린다.
 *
 * 왜 필요한가(2026-08-28): 이 기능은 순수 규칙(`result-mail-rules.test.ts`)만 검증된 채
 * 마이그레이션 0033 과 함께 운영에 나갔다. 규칙이 맞아도 담기지 않거나 두 번 담기는 일은
 * SQL 층에서 벌어진다 — `(applicant_id, stage)` UNIQUE, 조인, 전역 대기열이 그렇다.
 * 34기 접수 전에 한 바퀴 돌려 보라는 04-TODO 항목이 여기 해당한다.
 *
 * ⚠ 워커는 **기수를 가리지 않고 전역 대기열**을 집는다. 그래서 각 테스트는 시작할 때
 *   `recruit_result_mails` 를 비운다 — 앞 테스트가 남긴 행이 다음 테스트의 통수를 바꾼다.
 */
describe('모집 결과 안내 메일 — 대기열·발송 워커 (실 DB)', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let actorId: string;
  let cohortId: string;
  let otherCohortId: string;
  let bulkCohortId: string;

  /** 이 기수에서 document 단계 대상이 되는 사람들의 주소(정답지). */
  const docTargetEmails = [
    'qa-mail-a1@example.invalid',
    'qa-mail-a2@example.invalid',
    'qa-mail-a3@example.invalid',
    'qa-mail-a4@example.invalid',
    'qa-mail-a5@example.invalid',
    'qa-mail-a6@example.invalid',
    'qa-mail-a7@example.invalid',
  ];
  const interviewTargetEmails = ['qa-mail-a1@example.invalid', 'qa-mail-a2@example.invalid'];
  const finalTargetEmails = ['qa-mail-a6@example.invalid', 'qa-mail-a7@example.invalid'];

  async function cleanup() {
    const olds = await db
      .select({ id: recruitCohorts.id })
      .from(recruitCohorts)
      .where(inArray(recruitCohorts.label, [COHORT_LABEL, OTHER_LABEL, BULK_LABEL]));
    for (const c of olds) {
      await db.delete(auditLogs).where(eq(auditLogs.targetId, c.id));
      await db.delete(recruitCohorts).where(eq(recruitCohorts.id, c.id)); // applicants·slots·mails 는 cascade
    }
    await db.delete(users).where(like(users.email, 'qa-mail-%@example.invalid'));
  }

  async function makeApplicant(input: {
    cohortId?: string;
    name: string;
    status: 'received' | 'doc_pass' | 'doc_fail' | 'interview_done' | 'final_pass' | 'final_fail';
    email: string | null;
    slotId?: string | null;
  }) {
    const [a] = await db
      .insert(recruitApplicants)
      .values({
        cohortId: input.cohortId ?? cohortId,
        name: input.name,
        phone: `010${String(Math.floor(Math.random() * 90000000 + 10000000))}`,
        status: input.status,
        email: input.email,
        slotId: input.slotId ?? null,
      })
      .returning();
    return a!.id;
  }

  const rowsFor = async (stage: 'document' | 'interview' | 'final') =>
    db
      .select({
        id: recruitResultMails.id,
        status: recruitResultMails.status,
        attempts: recruitResultMails.attempts,
        lastError: recruitResultMails.lastError,
        sentAt: recruitResultMails.sentAt,
        email: recruitApplicants.email,
      })
      .from(recruitResultMails)
      .innerJoin(recruitApplicants, eq(recruitResultMails.applicantId, recruitApplicants.id))
      .where(and(eq(recruitResultMails.stage, stage), eq(recruitApplicants.cohortId, cohortId)));

  beforeAll(async () => {
    sql = postgres(TEST_DATABASE_URL, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup(); // 앞선 크래시 잔여 데이터 방지(멱등)

    const [actor] = await db.insert(users).values({ email: ACTOR_EMAIL, name: 'QA메일담당' }).returning();
    actorId = actor!.id;

    // 서류·면접 안내는 schedulePublic, 최종은 resultPublic 을 본다.
    // resultPublic 은 일부러 꺼 두고 시작한다 — 스위치가 막는지 확인해야 한다.
    const [c] = await db
      .insert(recruitCohorts)
      .values({ label: COHORT_LABEL, createdBy: actorId, schedulePublic: true, resultPublic: false })
      .returning();
    cohortId = c!.id;

    const [other] = await db
      .insert(recruitCohorts)
      .values({ label: OTHER_LABEL, createdBy: actorId, schedulePublic: true })
      .returning();
    otherCohortId = other!.id;

    const [bulk] = await db
      .insert(recruitCohorts)
      .values({ label: BULK_LABEL, createdBy: actorId, schedulePublic: true })
      .returning();
    bulkCohortId = bulk!.id;

    const [slot] = await db
      .insert(recruitSlots)
      .values({ cohortId, panel: 'A조', startsAt: new Date('2026-09-05T01:00:00Z'), createdBy: actorId })
      .returning();
    const slotId = slot!.id;

    // 상태·이메일 조합을 실제 기수 모양대로 깐다.
    await makeApplicant({ name: 'QA면접배정1', status: 'doc_pass', email: docTargetEmails[0]!, slotId });
    await makeApplicant({ name: 'QA면접배정2', status: 'doc_pass', email: docTargetEmails[1]!, slotId });
    await makeApplicant({ name: 'QA서류합격무배정', status: 'doc_pass', email: docTargetEmails[2]! });
    await makeApplicant({ name: 'QA서류탈락', status: 'doc_fail', email: docTargetEmails[3]! });
    await makeApplicant({ name: 'QA면접완료', status: 'interview_done', email: docTargetEmails[4]! });
    await makeApplicant({ name: 'QA최종합격', status: 'final_pass', email: docTargetEmails[5]! });
    await makeApplicant({ name: 'QA최종불합격', status: 'final_fail', email: docTargetEmails[6]! });
    // 상태가 아직 안 정해진 사람 — 어느 단계에도 들어가지 않고 '보낼 수 없는 사람' 에도 안 잡힌다.
    await makeApplicant({ name: 'QA접수만', status: 'received', email: 'qa-mail-a8@example.invalid' });
    // ⚠ 33기 운영 데이터에 실제로 있던 모양이다 — 이메일 칸에 주소가 아니라 문장이 들어갔다.
    //   서버 검증이 생기기 전에 접수된 행이라 지금도 남아 있다.
    await makeApplicant({
      name: 'QA주소에문장',
      status: 'doc_pass',
      email: 'qa-mail-a9@example.invalid (8월까지 해외체류라 메일로 부탁드립니다)',
      slotId,
    });
    await makeApplicant({ name: 'QA이메일없음', status: 'doc_pass', email: null, slotId });

    // 기수 경계 확인용 — 다른 기수의 대상자는 절대 담기면 안 된다.
    await makeApplicant({
      cohortId: otherCohortId,
      name: 'QA다른기수',
      status: 'doc_pass',
      email: 'qa-mail-other@example.invalid',
    });

    // 한 사이클 상한(25통) 확인용 — 26명.
    for (let i = 0; i < BATCH_PER_TICK + 1; i++) {
      await makeApplicant({
        cohortId: bulkCohortId,
        name: `QA대량${i}`,
        status: 'doc_fail',
        email: `qa-mail-bulk-${i}@example.invalid`,
      });
    }
  }, 60_000);

  beforeEach(async () => {
    // 워커는 전역 대기열을 집는다 — 앞 테스트의 잔여 행이 통수를 바꾼다.
    await db.delete(recruitResultMails);
  });

  afterAll(async () => {
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  it('미리보기가 대상·보낼 수 없는 사람을 실제 데이터에서 정확히 센다', async () => {
    const preview = await previewResultMails(cohortId, 'document');
    expect(preview.eligible).toBe(docTargetEmails.length); // 7
    expect(preview.toQueue).toBe(docTargetEmails.length);
    expect(preview.alreadyQueued).toBe(0);
    // 주소에 문장이 들어간 사람 + 이메일이 없는 사람. 상태가 안 정해진 사람은 여기 안 들어간다.
    expect(preview.noEmail).toBe(2);
    expect(preview.switchOn).toBe(true);
    expect(preview.requiredSwitch).toBe('schedulePublic');
  });

  it('적재하면 그 기수 대상만 담기고, 누가 걸었는지 [high] 로 남는다', async () => {
    const result = await queueResultMails(cohortId, 'document', actorId);
    expect(result).toEqual({ queued: docTargetEmails.length, skipped: 0 });

    const rows = await rowsFor('document');
    expect(rows.map((r) => r.email).sort()).toEqual([...docTargetEmails].sort());
    expect(rows.every((r) => r.status === 'queued' && r.attempts === 0)).toBe(true);

    // 다른 기수 지원자는 전역 대기열 어디에도 없어야 한다.
    const all = await db
      .select({ email: recruitApplicants.email })
      .from(recruitResultMails)
      .innerJoin(recruitApplicants, eq(recruitResultMails.applicantId, recruitApplicants.id));
    expect(all.some((r) => r.email === 'qa-mail-other@example.invalid')).toBe(false);

    const audits = await db
      .select({ action: auditLogs.action, actor: auditLogs.actorUserId, after: auditLogs.afterJson })
      .from(auditLogs)
      .where(eq(auditLogs.targetId, cohortId));
    const queued = audits.find((a) => a.action.startsWith('recruit.resultMail.queue'));
    expect(queued?.action).toContain('[high]');
    expect(queued?.actor).toBe(actorId);
    expect(queued?.after).toMatchObject({ stage: 'document', queued: docTargetEmails.length });
  });

  it('버튼을 두 번 눌러도 두 통이 되지 않는다', async () => {
    await queueResultMails(cohortId, 'document', actorId);
    const second = await queueResultMails(cohortId, 'document', actorId);
    expect(second).toEqual({ queued: 0, skipped: docTargetEmails.length });
    expect((await rowsFor('document')).length).toBe(docTargetEmails.length);

    const preview = await previewResultMails(cohortId, 'document');
    expect(preview.alreadyQueued).toBe(docTargetEmails.length);
    expect(preview.toQueue).toBe(0);
  });

  it('워커가 대기열을 비우고 sent 로 확정한다 — 본문에 당락은 없다', async () => {
    await queueResultMails(cohortId, 'document', actorId);
    const { mailer, sent } = stubMailer();

    const summary = await runResultMailWorker({ mailer, appUrl: 'https://qa.example.invalid' });
    expect(summary.sent).toBe(docTargetEmails.length);
    expect(summary.failed).toBe(0);
    expect(summary.deferred).toBe(0);
    expect(summary.remainingQueued).toBe(0);

    expect(sent.map((m) => m.to).sort()).toEqual([...docTargetEmails].sort());
    for (const mail of sent) {
      expect(`${mail.subject} ${mail.text}`).not.toMatch(/합격|불합격|탈락/);
      expect(mail.text).toContain('https://qa.example.invalid/recruit');
    }

    const rows = await rowsFor('document');
    expect(rows.every((r) => r.status === 'sent' && r.attempts === 1 && r.sentAt !== null)).toBe(true);

    const status = await resultMailStatus(cohortId);
    expect(status.find((s) => s.stage === 'document')).toEqual({
      stage: 'document',
      queued: 0,
      sent: docTargetEmails.length,
      failed: 0,
    });
  });

  it('면접 일정 안내는 자리가 잡힌 서류 합격자에게만 간다', async () => {
    const preview = await previewResultMails(cohortId, 'interview');
    expect(preview.eligible).toBe(interviewTargetEmails.length); // 슬롯 없는 서류 합격자는 빠진다
    await queueResultMails(cohortId, 'interview', actorId);

    const { mailer, sent } = stubMailer();
    await runResultMailWorker({ mailer, appUrl: 'https://qa.example.invalid' });
    expect(sent.map((m) => m.to).sort()).toEqual([...interviewTargetEmails].sort());
  });

  it('최종 결과 공개 스위치가 꺼져 있으면 한 통도 담기지 않는다', async () => {
    await expect(queueResultMails(cohortId, 'final', actorId)).rejects.toBeInstanceOf(SwitchOffError);
    expect((await rowsFor('final')).length).toBe(0);

    await db.update(recruitCohorts).set({ resultPublic: true }).where(eq(recruitCohorts.id, cohortId));
    try {
      const result = await queueResultMails(cohortId, 'final', actorId);
      expect(result.queued).toBe(finalTargetEmails.length);
      const rows = await rowsFor('final');
      expect(rows.map((r) => r.email).sort()).toEqual([...finalTargetEmails].sort());
    } finally {
      await db.update(recruitCohorts).set({ resultPublic: false }).where(eq(recruitCohorts.id, cohortId));
    }
  });

  it('담은 뒤 주소가 깨지면 발송을 시도하지 않고 즉시 실패로 확정한다', async () => {
    await queueResultMails(cohortId, 'document', actorId);
    const victim = (await rowsFor('document'))[0]!;
    const applicant = await db
      .select({ id: recruitApplicants.id })
      .from(recruitApplicants)
      .where(eq(recruitApplicants.email, victim.email!));
    await db
      .update(recruitApplicants)
      .set({ email: 'qa-mail-깨진주소, another@example.invalid' }) // 콤마 = 다중 수신자 통로
      .where(eq(recruitApplicants.id, applicant[0]!.id));

    const { mailer, sent } = stubMailer();
    const summary = await runResultMailWorker({ mailer, appUrl: 'https://qa.example.invalid' });

    expect(summary.failed).toBe(1);
    expect(summary.sent).toBe(docTargetEmails.length - 1);
    expect(sent.some((m) => m.to.includes(','))).toBe(false); // 그 주소로는 시도조차 하지 않는다

    const broken = (await rowsFor('document')).find((r) => r.id === victim.id)!;
    expect(broken.status).toBe('failed');
    expect(broken.lastError).toContain('형식');

    // 원래 주소로 되돌린다(다음 테스트의 정답지가 바뀌지 않도록).
    await db
      .update(recruitApplicants)
      .set({ email: victim.email })
      .where(eq(recruitApplicants.id, applicant[0]!.id));
  });

  it('발송이 실패하면 다시 시도하고, 세 번째에 실패로 확정한다', async () => {
    await queueResultMails(cohortId, 'interview', actorId);
    const { mailer, calls } = failingMailer();

    let summary = await runResultMailWorker({ mailer, appUrl: 'https://qa.example.invalid' });
    expect(summary.sent).toBe(0);
    expect(summary.failed).toBe(0); // 아직 확정 아님 — 다음 사이클에 다시 집는다
    expect((await rowsFor('interview')).every((r) => r.status === 'queued' && r.attempts === 1)).toBe(true);

    summary = await runResultMailWorker({ mailer, appUrl: 'https://qa.example.invalid' });
    expect((await rowsFor('interview')).every((r) => r.status === 'queued' && r.attempts === 2)).toBe(true);

    summary = await runResultMailWorker({ mailer, appUrl: 'https://qa.example.invalid' });
    expect(summary.failed).toBe(interviewTargetEmails.length);
    const rows = await rowsFor('interview');
    expect(rows.every((r) => r.status === 'failed' && r.attempts === 3)).toBe(true);
    expect(rows[0]!.lastError).toContain('SMTP');
    expect(calls()).toBe(interviewTargetEmails.length * 3);

    // 확정된 뒤에는 워커가 다시 집지 않는다.
    const after = await runResultMailWorker({ mailer, appUrl: 'https://qa.example.invalid' });
    expect(after.sent + after.failed).toBe(0);
  });

  it('한 사이클에 25통까지만 보내고 나머지는 대기열에 남는다', async () => {
    const queued = await queueResultMails(bulkCohortId, 'document', actorId);
    expect(queued.queued).toBe(BATCH_PER_TICK + 1);

    const { mailer, sent } = stubMailer();
    const first = await runResultMailWorker({ mailer, appUrl: 'https://qa.example.invalid' });
    expect(first.sent).toBe(BATCH_PER_TICK);
    expect(first.deferred).toBe(1);
    expect(first.remainingQueued).toBe(1);
    expect(sent.length).toBe(BATCH_PER_TICK);

    const second = await runResultMailWorker({ mailer, appUrl: 'https://qa.example.invalid' });
    expect(second.sent).toBe(1);
    expect(second.remainingQueued).toBe(0);
    expect(new Set(sent.map((m) => m.to)).size).toBe(BATCH_PER_TICK + 1); // 같은 사람에게 두 번 가지 않는다
  }, 60_000);
});
