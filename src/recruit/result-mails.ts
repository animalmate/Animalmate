// F9 결과 안내 메일 — 대기열 적재와 발송 워커.
//
// 흐름: 회장단/홍보팀이 "결과 안내 메일 보내기" → 미리보기(대상 수) → 확정 시 `queued` 행 적재
//       → pg_cron 이 `/api/cron/result-mails` 를 두드리면 하루 한도 안에서 조금씩 발송.
//
// **공개 스위치와 발송을 분리한 이유**(2026-08-26, 결정 148): 스위치는 껐다 켤 수 있는 값인데
// 메일은 되돌릴 수 없다. 스위치에 발송을 걸면 실수로 껐다 켠 순간 200명에게 두 번 나간다.
// 또 서류 결과와 면접 일정이 같은 스위치를 쓰므로, 스위치로는 두 안내를 구분해 보낼 수 없다.

import { and, count, eq, gte, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { recruitApplicants, recruitCohorts, recruitResultMails } from '../db/schema';
import { defaultMailer, type Mailer } from '../auth/mailer';
import { buildAuditEntry, recordAudit } from '../auth/audit';
import type { RecruitStatus } from './status';
import {
  isExhausted,
  isResultMailTarget,
  requiredSwitch,
  resultMailContent,
  sendableNow,
  STAGE_LABEL,
  type ResultMailStage,
} from './result-mail-rules';

export interface QueuePreview {
  stage: ResultMailStage;
  /** 이 단계 대상 전체(이메일이 있고 상태가 맞는 사람). */
  eligible: number;
  /** 이미 보냈거나 대기 중이라 이번에 제외되는 수. */
  alreadyQueued: number;
  /** 실제로 새로 담기는 수. */
  toQueue: number;
  /** 이메일이 없어 보낼 수 없는 수 — 운영진이 따로 연락해야 하는 사람들이다. */
  noEmail: number;
  /** 공개 스위치가 꺼져 있으면 발송할 수 없다(메일 받고 들어와도 '심사 중'만 보인다). */
  switchOn: boolean;
  requiredSwitch: 'schedulePublic' | 'resultPublic';
}

/** 미리보기와 실제 적재가 **같은 판단**을 쓰도록 한 곳에서 계산한다. */
async function collect(cohortId: string, stage: ResultMailStage) {
  const [cohort] = await db
    .select({
      label: recruitCohorts.label,
      schedulePublic: recruitCohorts.schedulePublic,
      resultPublic: recruitCohorts.resultPublic,
    })
    .from(recruitCohorts)
    .where(eq(recruitCohorts.id, cohortId));

  const applicants = await db
    .select({
      id: recruitApplicants.id,
      status: recruitApplicants.status,
      slotId: recruitApplicants.slotId,
      email: recruitApplicants.email,
    })
    .from(recruitApplicants)
    .where(eq(recruitApplicants.cohortId, cohortId));

  const targets = applicants.filter((a) =>
    isResultMailTarget(stage, { status: a.status as RecruitStatus, slotId: a.slotId, email: a.email })
  );

  // 이메일만 없어서 빠진 사람 — 대상 조건은 맞는데 보낼 곳이 없는 경우다.
  const noEmail = applicants.filter(
    (a) =>
      !isResultMailTarget(stage, { status: a.status as RecruitStatus, slotId: a.slotId, email: a.email }) &&
      isResultMailTarget(stage, { status: a.status as RecruitStatus, slotId: a.slotId, email: 'x@x' })
  ).length;

  const existing = targets.length
    ? await db
        .select({ applicantId: recruitResultMails.applicantId })
        .from(recruitResultMails)
        .where(
          and(
            eq(recruitResultMails.stage, stage),
            inArray(
              recruitResultMails.applicantId,
              targets.map((t) => t.id)
            )
          )
        )
    : [];
  const seen = new Set(existing.map((e) => e.applicantId));

  const key = requiredSwitch(stage);
  return {
    cohort,
    targets,
    noEmail,
    seen,
    switchOn: key === 'resultPublic' ? !!cohort?.resultPublic : !!cohort?.schedulePublic,
    key,
  };
}

export async function previewResultMails(cohortId: string, stage: ResultMailStage): Promise<QueuePreview> {
  const { targets, noEmail, seen, switchOn, key } = await collect(cohortId, stage);
  return {
    stage,
    eligible: targets.length,
    alreadyQueued: targets.filter((t) => seen.has(t.id)).length,
    toQueue: targets.filter((t) => !seen.has(t.id)).length,
    noEmail,
    switchOn,
    requiredSwitch: key,
  };
}

export class SwitchOffError extends Error {
  readonly status = 400;
  constructor(stage: ResultMailStage) {
    super(
      stage === 'final'
        ? '최종 합격 결과 공개를 먼저 켜 주세요. 메일을 받고 들어와도 결과가 보이지 않습니다.'
        : '면접 일정/링크 공개를 먼저 켜 주세요. 메일을 받고 들어와도 결과가 보이지 않습니다.'
    );
    this.name = 'SwitchOffError';
  }
}

/**
 * 대상자를 대기열에 담는다. **이미 담겼거나 보낸 사람은 건너뛴다** —
 * `(applicant_id, stage)` UNIQUE 가 최종 방어선이라, 버튼을 두 번 눌러도 두 통이 되지 않는다.
 */
export async function queueResultMails(
  cohortId: string,
  stage: ResultMailStage,
  actorUserId: string
): Promise<{ queued: number; skipped: number }> {
  const { targets, seen, switchOn } = await collect(cohortId, stage);
  if (!switchOn) throw new SwitchOffError(stage);

  const fresh = targets.filter((t) => !seen.has(t.id));
  if (fresh.length > 0) {
    await db
      .insert(recruitResultMails)
      .values(fresh.map((t) => ({ applicantId: t.id, stage, queuedBy: actorUserId })))
      // 미리보기와 확정 사이에 다른 사람이 같은 버튼을 눌렀을 수 있다. 경합해도 두 통이 되지 않는다.
      .onConflictDoNothing({ target: [recruitResultMails.applicantId, recruitResultMails.stage] });
  }

  // 200명에게 나가는 되돌릴 수 없는 행위 — 누가 언제 걸었는지 반드시 남는다(규칙 #4).
  await recordAudit(
    db,
    buildAuditEntry({
      actorUserId,
      action: 'recruit.resultMail.queue',
      targetTable: 'recruit_result_mails',
      targetId: cohortId,
      after: { stage, label: STAGE_LABEL[stage], queued: fresh.length, skipped: targets.length - fresh.length },
      severity: 'high',
    })
  );

  return { queued: fresh.length, skipped: targets.length - fresh.length };
}

export interface MailWorkerSummary {
  sent: number;
  failed: number;
  /** 하루 한도에 걸려 다음 사이클로 미룬 수. */
  deferred: number;
  remainingQueued: number;
}

/**
 * 대기열에서 꺼내 보낸다. 크론이 부른다.
 *
 * 한도를 넘긴 것은 **버리지 않고 queued 로 둔다** — 다음 날 이어서 나간다(사용자 결정).
 * 발송은 한 통씩 순차로 한다: 한꺼번에 열어 젖히면 Gmail 이 도배로 보고 계정을 막는다.
 */
export async function runResultMailWorker(deps: { mailer?: Mailer; appUrl?: string } = {}): Promise<MailWorkerSummary> {
  const mailer = deps.mailer ?? defaultMailer();
  const lookupUrl = `${(deps.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '')}/recruit`;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [sentRow] = await db
    .select({ value: count() })
    .from(recruitResultMails)
    .where(and(eq(recruitResultMails.status, 'sent'), gte(recruitResultMails.sentAt, since)));
  const sentInLast24h = sentRow?.value ?? 0;

  const [queuedRow] = await db
    .select({ value: count() })
    .from(recruitResultMails)
    .where(eq(recruitResultMails.status, 'queued'));
  const queuedCount = queuedRow?.value ?? 0;

  const take = sendableNow(sentInLast24h, queuedCount);
  const summary: MailWorkerSummary = {
    sent: 0,
    failed: 0,
    deferred: Math.max(0, queuedCount - take),
    remainingQueued: queuedCount,
  };
  if (take === 0) return summary;

  // 보낼 것과 그 사람의 이메일·기수를 한 번에 읽는다.
  const batch = await db
    .select({
      id: recruitResultMails.id,
      stage: recruitResultMails.stage,
      attempts: recruitResultMails.attempts,
      email: recruitApplicants.email,
      cohortLabel: recruitCohorts.label,
    })
    .from(recruitResultMails)
    .innerJoin(recruitApplicants, eq(recruitResultMails.applicantId, recruitApplicants.id))
    .innerJoin(recruitCohorts, eq(recruitApplicants.cohortId, recruitCohorts.id))
    .where(eq(recruitResultMails.status, 'queued'))
    // 먼저 담긴 것부터. 재시도로 돌아온 것이 앞줄을 막지 않게 시도 횟수가 적은 것을 우선한다.
    .orderBy(recruitResultMails.attempts, recruitResultMails.queuedAt)
    .limit(take);

  for (const row of batch) {
    const attempts = row.attempts + 1;

    if (!row.email || !row.email.trim()) {
      // 담은 뒤에 이메일이 지워진 경우. 재시도해도 저절로 풀리지 않는다 — 즉시 확정 실패.
      await db
        .update(recruitResultMails)
        .set({ status: 'failed', attempts, lastError: '이메일 주소가 없습니다.' })
        .where(eq(recruitResultMails.id, row.id));
      summary.failed += 1;
      continue;
    }

    const { subject, text } = resultMailContent(row.stage, row.cohortLabel, lookupUrl);
    try {
      await mailer.send({ to: row.email, subject, text });
      await db
        .update(recruitResultMails)
        .set({ status: 'sent', attempts, sentAt: new Date(), lastError: null })
        .where(eq(recruitResultMails.id, row.id));
      summary.sent += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const done = isExhausted(attempts);
      await db
        .update(recruitResultMails)
        .set({ status: done ? 'failed' : 'queued', attempts, lastError: message.slice(0, 500) })
        .where(eq(recruitResultMails.id, row.id));
      if (done) summary.failed += 1;
    }
  }

  summary.remainingQueued = queuedCount - summary.sent - summary.failed;
  return summary;
}

export interface ResultMailStatusRow {
  stage: ResultMailStage;
  queued: number;
  sent: number;
  failed: number;
}

/** 기수의 단계별 발송 현황 — 화면이 "몇 통 나갔는지" 를 보여 준다. */
export async function resultMailStatus(cohortId: string): Promise<ResultMailStatusRow[]> {
  const rows = await db
    .select({
      stage: recruitResultMails.stage,
      status: recruitResultMails.status,
      value: count(),
    })
    .from(recruitResultMails)
    .innerJoin(recruitApplicants, eq(recruitResultMails.applicantId, recruitApplicants.id))
    .where(eq(recruitApplicants.cohortId, cohortId))
    .groupBy(recruitResultMails.stage, recruitResultMails.status);

  const byStage = new Map<ResultMailStage, ResultMailStatusRow>();
  for (const s of ['document', 'interview', 'final'] as ResultMailStage[]) {
    byStage.set(s, { stage: s, queued: 0, sent: 0, failed: 0 });
  }
  for (const r of rows) {
    const row = byStage.get(r.stage)!;
    row[r.status] = r.value;
  }
  return [...byStage.values()];
}
