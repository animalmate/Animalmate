// 일괄 생성 도우미 — 반복 패턴(매월 N번째 X요일 HH:MM)+기간(시작~끝월) → 템플릿 기반 초안 N건 즉시 생성.
// 각 회차 = event(봉사 일시) + scheduled_post(발행 예약, event_id 연결). 크론 아님(즉시 실행).
//
// 결정(2026-07-23):
//  - 패턴이 정하는 건 **봉사 날짜**(event_date). meet_time = 패턴 시각.
//  - publish_at = 봉사일 − notice_lead_days, 발행 시각(publish_time). KST 기준으로 계산해 UTC 저장.
//  - 산출된 publish_at 이 이미 지났으면 그 회차는 건너뛰고 결과에 표시.

import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db/types';
import { events, scheduledPosts } from '@/db/schema';
import type { Actor } from '@/auth/permissions';
import { requireAuthorized } from '@/auth/guard';
import { buildAuditEntry, recordAudit } from '@/auth/audit';
import { resolveRuleDate, type CalendarDate, type Weekday } from '@/recurrence/month-weekday';
import { getTemplate, renderTemplate } from './post-templates';

const KST_OFFSET_MIN = 9 * 60; // KST = UTC+9

/** KST 벽시계(연/월/일 + HH:MM)를 UTC Date 로 변환. */
function kstToUtc(cal: CalendarDate, timeHHMM: string): Date {
  const [h, m] = timeHHMM.split(':').map((x) => Number(x));
  const utcMs = Date.UTC(cal.year, cal.month - 1, cal.day, h ?? 0, m ?? 0) - KST_OFFSET_MIN * 60_000;
  return new Date(utcMs);
}

function minusDays(cal: CalendarDate, n: number): CalendarDate {
  const d = new Date(Date.UTC(cal.year, cal.month - 1, cal.day) - n * 86_400_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function fmtDate(cal: CalendarDate): string {
  return `${cal.year}-${String(cal.month).padStart(2, '0')}-${String(cal.day).padStart(2, '0')}`;
}

/** 시작~끝(연,월) 범위의 월 목록. */
function monthsInRange(startY: number, startM: number, endY: number, endM: number): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  let y = startY;
  let m = startM;
  while (y < endY || (y === endY && m <= endM)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export interface BatchPreset {
  teamId: string;
  monthWeek: '1' | '2' | '3' | '4' | 'last';
  weekday: Weekday;
  meetTime: string; // 봉사 집합시간 'HH:MM'
  boardMenuid: number;
  templateId?: string | null;
  noticeLeadDays: number; // 봉사일 - N일 = 발행일
  publishTime: string; // 발행 시각 'HH:MM'
}

export interface BatchRange {
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
}

export interface BatchResult {
  created: { eventId: string | null; postId: string | null; eventDate: string; publishAt: string }[];
  skipped: { year: number; month: number; reason: 'no_occurrence' | 'publish_past' }[];
}

/**
 * 프리셋+기간으로 초안 N건을 생성한다(팀장단/회장단). event+post 를 함께 만든다.
 * dryRun 이면 실제 삽입 없이 생성 예정 목록만 계산(미리보기).
 */
export async function batchGenerate(
  db: Db,
  actor: Actor,
  preset: BatchPreset,
  range: BatchRange,
  now: Date = new Date(),
  dryRun = false
): Promise<BatchResult> {
  requireAuthorized(actor, { kind: 'recurring.manage', owner: { ownerType: 'team', ownerId: preset.teamId } });

  const template = preset.templateId ? await getTemplate(db, preset.templateId) : null;
  const result: BatchResult = { created: [], skipped: [] };

  for (const { year, month } of monthsInRange(range.startYear, range.startMonth, range.endYear, range.endMonth)) {
    const occ = resolveRuleDate(year, month, preset.monthWeek, preset.weekday);
    if (!occ) {
      result.skipped.push({ year, month, reason: 'no_occurrence' });
      continue;
    }
    const eventDate = fmtDate(occ);
    const publishAt = kstToUtc(minusDays(occ, preset.noticeLeadDays), preset.publishTime);
    if (publishAt.getTime() <= now.getTime()) {
      result.skipped.push({ year, month, reason: 'publish_past' });
      continue;
    }

    const vars = { 날짜: eventDate, 집합시간: preset.meetTime };
    const title = template ? renderTemplate(template.titleTemplate, vars) : `${eventDate} 봉사 공지`;
    const content = template ? renderTemplate(template.bodyTemplate, vars) : '';

    if (dryRun) {
      result.created.push({ eventId: null, postId: null, eventDate, publishAt: publishAt.toISOString() });
      continue;
    }

    const created = await db.transaction(async (tx) => {
      const [ev] = await tx
        .insert(events)
        .values({ teamId: preset.teamId, title, eventDate, meetTime: preset.meetTime, status: 'draft' })
        .returning();
      const [post] = await tx
        .insert(scheduledPosts)
        .values({
          ownerType: 'team',
          ownerId: preset.teamId,
          authorUserId: actor.userId,
          boardMenuid: preset.boardMenuid,
          eventId: ev!.id,
          title,
          contentMd: content,
          publishAt,
          status: 'draft',
        })
        .returning();
      await recordAudit(
        tx,
        buildAuditEntry({
          actorUserId: actor.userId,
          action: 'batch.generate_draft',
          targetTable: 'scheduled_posts',
          targetId: post!.id,
          after: { eventId: ev!.id, eventDate, publishAt: publishAt.toISOString() },
        })
      );
      return { eventId: ev!.id, postId: post!.id };
    });

    result.created.push({ ...created, eventDate, publishAt: publishAt.toISOString() });
  }

  return result;
}
