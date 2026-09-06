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
import { recruitApplicants, recruitCohorts, recruitResultMails, recruitSlots } from '../db/schema';
import { defaultMailer, type Mailer } from '../auth/mailer';
import { buildAuditEntry, recordAudit } from '../auth/audit';
import { isValidEmail } from '../lib/email';
import type { RecruitStatus } from './status';
import {
  isExhausted,
  isResultMailTarget,
  normalizeSchedule,
  requiredSwitch,
  resultMailContent,
  scheduleChange,
  scheduleFingerprint,
  SCHEDULE_STAGES,
  sendableNow,
  STAGE_LABEL,
  type MailTargetInput,
  type ResultMailStage,
  type ScheduleChange,
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
  /**
   * `interview` 단계에서만 채운다 — **왜** 이 사람들이 대상인지. 변경 안내는 "무엇이 바뀌었길래
   * 64명이나 되지?" 를 누르기 전에 확인할 수 있어야 한다(결정 148 의 연장).
   */
  changed?: Record<ScheduleChange, number>;
  /** 자리는 있으나 알린 일정 그대로라 보내지 않는 사람. 0 이 정상이고, 크면 안심하고 넘어가면 된다. */
  unchanged?: number;
  /** 첫 안내(서류 결과)가 나간 적 없는 사람 — 변경 안내가 아니라 서류 안내를 보내야 한다. */
  neverNotified?: number;
}

/**
 * 이메일만 없어서 빠진 사람을 세기 위한 자리 표시 주소.
 * **반드시 형식 검사를 통과하는 값**이어야 뺄셈이 성립한다(`isResultMailTarget` 이 형식까지 보므로
 * 'x@x' 같은 값을 쓰면 아무도 세지 못하고 늘 0 이 된다).
 */
const PLACEHOLDER_EMAIL = 'x@example.invalid';

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

  // 슬롯을 **함께** 읽는다. 변경 판정은 슬롯 배정(slot_id)만이 아니라 그 슬롯의 시각·장소까지
  // 봐야 한다 — 같은 슬롯의 시간을 30분 옮기면 slot_id 는 그대로인데 지원자가 볼 값은 달라진다.
  const applicants = await db
    .select({
      id: recruitApplicants.id,
      status: recruitApplicants.status,
      slotId: recruitApplicants.slotId,
      email: recruitApplicants.email,
      personalLink: recruitApplicants.interviewLink,
      startsAt: recruitSlots.startsAt,
      durationMin: recruitSlots.durationMin,
      venue: recruitSlots.venue,
      link: recruitSlots.link,
      isRemote: recruitSlots.isRemote,
    })
    .from(recruitApplicants)
    .leftJoin(recruitSlots, eq(recruitApplicants.slotId, recruitSlots.id))
    .where(eq(recruitApplicants.cohortId, cohortId));

  const scheduleOf = new Map<string, string>();
  for (const a of applicants) {
    scheduleOf.set(
      a.id,
      scheduleFingerprint(
        normalizeSchedule(
          a.startsAt === null
            ? null
            : {
                startsAt: a.startsAt,
                durationMin: a.durationMin!,
                venue: a.venue,
                link: a.link,
                isRemote: a.isRemote!,
                personalLink: a.personalLink,
              }
        )
      )
    );
  }

  // 지금까지 이 사람에게 **일정을 실어 나간** 메일들 중 마지막 것이 기준선이다.
  // 실패(failed)한 행도 센다 — 예전 `seen` 이 그랬듯 "이미 걸었다"로 보고, 실패는 화면의
  // '실패 N' 으로 따로 드러난다. 여기서 실패를 빼면 같은 사람에게 계속 다시 담긴다.
  const ids = applicants.map((a) => a.id);
  const notifiedRows = ids.length
    ? await db
        .select({
          applicantId: recruitResultMails.applicantId,
          notifiedSchedule: recruitResultMails.notifiedSchedule,
        })
        .from(recruitResultMails)
        .where(
          and(
            inArray(recruitResultMails.applicantId, ids),
            inArray(recruitResultMails.stage, [...SCHEDULE_STAGES])
          )
        )
        // 마지막에 알린 값이 기준선이다. 오름차순으로 훑어 뒤엣것이 앞엣것을 덮게 둔다.
        .orderBy(recruitResultMails.queuedAt)
    : [];
  const lastNotified = new Map<string, string | null>();
  for (const r of notifiedRows) lastNotified.set(r.applicantId, r.notifiedSchedule);

  const inputOf = (a: (typeof applicants)[number], email: string | null): MailTargetInput => ({
    status: a.status as RecruitStatus,
    slotId: a.slotId,
    email,
    schedule: scheduleOf.get(a.id)!,
    notifiedSchedule: lastNotified.get(a.id) ?? null,
  });

  const targets = applicants.filter((a) => isResultMailTarget(stage, inputOf(a, a.email)));

  // 단계 조건은 맞는데 보낼 곳이 없는 사람.
  const noEmail = applicants.filter(
    (a) => !isResultMailTarget(stage, inputOf(a, a.email)) && isResultMailTarget(stage, inputOf(a, PLACEHOLDER_EMAIL))
  ).length;

  const existing = targets.length
    ? await db
        .select({
          applicantId: recruitResultMails.applicantId,
          notifiedSchedule: recruitResultMails.notifiedSchedule,
        })
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
  // 변경 안내는 사람당 한 통이 아니라 **일정당 한 통**이다 — 같은 사람의 지난 변경 안내가
  // 이번 변경을 막으면 안 된다. 서류·최종은 예전대로 사람당 한 통.
  const seen = new Set(
    existing
      .filter((e) => stage !== 'interview' || e.notifiedSchedule === scheduleOf.get(e.applicantId))
      .map((e) => e.applicantId)
  );

  const key = requiredSwitch(stage);
  return {
    cohort,
    applicants,
    targets,
    noEmail,
    seen,
    scheduleOf,
    lastNotified,
    switchOn: key === 'resultPublic' ? !!cohort?.resultPublic : !!cohort?.schedulePublic,
    key,
  };
}

export async function previewResultMails(cohortId: string, stage: ResultMailStage): Promise<QueuePreview> {
  const { applicants, targets, noEmail, seen, scheduleOf, lastNotified, switchOn, key } = await collect(
    cohortId,
    stage
  );

  const preview: QueuePreview = {
    stage,
    eligible: targets.length,
    alreadyQueued: targets.filter((t) => seen.has(t.id)).length,
    toQueue: targets.filter((t) => !seen.has(t.id)).length,
    noEmail,
    switchOn,
    requiredSwitch: key,
  };
  if (stage !== 'interview') return preview;

  // 자리가 잡힌 면접 전 지원자 전체를 이유별로 갈라 보여 준다. "왜 0명인지"도 여기서 읽힌다.
  const changed: Record<ScheduleChange, number> = { assigned: 0, time: 0, place: 0 };
  let unchanged = 0;
  let neverNotified = 0;
  for (const a of applicants) {
    if (a.status !== 'doc_pass' || a.slotId === null || !isValidEmail(a.email)) continue;
    const before = lastNotified.get(a.id) ?? null;
    if (before === null) {
      neverNotified += 1;
      continue;
    }
    const kind = scheduleChange(before, scheduleOf.get(a.id)!);
    if (kind) changed[kind] += 1;
    else unchanged += 1;
  }
  return { ...preview, changed, unchanged, neverNotified };
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
 * 대상자를 대기열에 담는다. **이미 담겼거나 보낸 사람은 건너뛴다** — 부분 UNIQUE 인덱스 두 개가
 * 최종 방어선이라(schema.ts 의 recruit_result_mails 주석), 버튼을 두 번 눌러도 두 통이 되지 않는다.
 *
 * 담는 행마다 **그 순간의 일정 지문**을 함께 적는다. 이 값이 다음 변경 판정의 기준선이 되므로,
 * 여기서 빠뜨리면 그 사람은 이후 일정이 바뀌어도 영영 대상이 되지 않는다.
 */
export async function queueResultMails(
  cohortId: string,
  stage: ResultMailStage,
  actorUserId: string
): Promise<{ queued: number; skipped: number }> {
  const { targets, seen, scheduleOf, switchOn } = await collect(cohortId, stage);
  if (!switchOn) throw new SwitchOffError(stage);

  const fresh = targets.filter((t) => !seen.has(t.id));
  if (fresh.length > 0) {
    await db
      .insert(recruitResultMails)
      .values(
        fresh.map((t) => ({
          applicantId: t.id,
          stage,
          queuedBy: actorUserId,
          // `final` 은 일정을 말하지 않는 메일이라 기준선이 아니다 — 적으면 안 된다.
          notifiedSchedule: SCHEDULE_STAGES.includes(stage) ? scheduleOf.get(t.id)! : null,
        }))
      )
      // 미리보기와 확정 사이에 다른 사람이 같은 버튼을 눌렀을 수 있다. 경합해도 두 통이 되지 않는다.
      // 충돌 대상을 적지 않는 이유: 단계마다 걸리는 UNIQUE 인덱스가 다르고(둘 다 부분 인덱스라
      // 추론에 WHERE 까지 맞춰야 한다), 여기서 막고 싶은 것은 "어떤 중복이든" 이다.
      .onConflictDoNothing();
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

    if (!isValidEmail(row.email)) {
      // 담은 뒤에 이메일이 지워졌거나, 주소가 아닌 값이 들어 있는 경우.
      // **여기가 마지막 관문이다**: 이 값은 바로 다음 줄에서 nodemailer 의 `to` 가 되므로,
      // 접수 단계에서 막았더라도(apply/route.ts) 그 전에 저장된 행을 위해 한 번 더 본다
      // (콤마로 이어 붙인 다중 수신자·헤더 인젝션 — src/lib/email.ts 머리 주석).
      // 재시도해도 저절로 풀리지 않는다 — 즉시 확정 실패.
      await db
        .update(recruitResultMails)
        .set({ status: 'failed', attempts, lastError: '이메일 주소가 없거나 형식이 올바르지 않습니다.' })
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
