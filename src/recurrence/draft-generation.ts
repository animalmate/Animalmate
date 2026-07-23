// 회차 초안 자동 생성 — 활성 반복 규칙 중 D-(draft_lead_days) 인 것의 events 초안을 만든다.
// 크론(매일) → /api/cron/draft-generate 가 호출. 멱등(같은 rule+date 중복 생성 안 함).
//
// 타임존 주의: 날짜 계산은 UTC 달력 기준. 실제 KST 경계 보정은 배포 시 검토(TODO).

import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { events } from '@/db/schema';
import type * as schema from '@/db/schema';
import { resolveRuleDate, type CalendarDate, type Weekday } from './month-weekday';
import { listActiveRules } from './recurring-rules';
import { buildAuditEntry, recordAudit } from '@/auth/audit';

type DB = PostgresJsDatabase<typeof schema>;

export interface RuleLike {
  monthWeek: '1' | '2' | '3' | '4' | 'last';
  weekday: number; // 0..6
  draftLeadDays: number;
}

function toCalendar(d: Date): CalendarDate {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function calEquals(a: CalendarDate, b: CalendarDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function subtractDays(cal: CalendarDate, n: number): CalendarDate {
  const t = Date.UTC(cal.year, cal.month - 1, cal.day) - n * 86_400_000;
  const d = new Date(t);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function formatDate(cal: CalendarDate): string {
  const mm = String(cal.month).padStart(2, '0');
  const dd = String(cal.day).padStart(2, '0');
  return `${cal.year}-${mm}-${dd}`;
}

/**
 * 규칙이 `now`(오늘) 기준 초안 생성일(occurrence - draft_lead_days)에 해당하면 그 회차 날짜를 반환.
 * 이번 달·다음 달 발생일을 검사(월말 근처 D-3 이 이전 달에 걸리는 경우 대비). 아니면 null.
 */
export function draftDueOccurrence(rule: RuleLike, now: Date): CalendarDate | null {
  const today = toCalendar(now);
  const months = [
    { year: today.year, month: today.month },
    today.month === 12 ? { year: today.year + 1, month: 1 } : { year: today.year, month: today.month + 1 },
  ];
  for (const { year, month } of months) {
    const occ = resolveRuleDate(year, month, rule.monthWeek, rule.weekday as Weekday);
    if (!occ) continue;
    if (calEquals(subtractDays(occ, rule.draftLeadDays), today)) return occ;
  }
  return null;
}

export interface DraftGenSummary {
  generatedAt: string;
  rulesChecked: number;
  created: number;
  eventIds: string[];
}

/** 활성 규칙을 훑어 오늘이 D-lead 인 회차의 events 초안을 생성(멱등). 요약을 audit 에 남긴다. */
export async function generateDueDrafts(db: DB, now: Date = new Date()): Promise<DraftGenSummary> {
  const rules = await listActiveRules(db);
  const eventIds: string[] = [];

  for (const rule of rules) {
    const occ = draftDueOccurrence(
      { monthWeek: rule.monthWeek, weekday: rule.weekday, draftLeadDays: rule.draftLeadDays },
      now
    );
    if (!occ) continue;
    const eventDate = formatDate(occ);

    // 멱등: 같은 규칙+날짜의 회차가 이미 있으면 건너뜀.
    const existing = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.ruleId, rule.id), eq(events.eventDate, eventDate)))
      .limit(1);
    if (existing.length) continue;

    const [ev] = await db
      .insert(events)
      .values({
        teamId: rule.teamId,
        ruleId: rule.id,
        title: rule.label,
        eventDate,
        meetTime: rule.time,
        status: 'draft',
      })
      .returning();
    eventIds.push(ev!.id);
    await recordAudit(
      db,
      buildAuditEntry({ actorUserId: null, action: 'event.draft_created', targetTable: 'events', targetId: ev!.id, after: ev })
    );
    // TODO: 팀장단 알림 메일(Resend 연결 후). 지금은 audit 로만 남긴다.
  }

  const summary: DraftGenSummary = {
    generatedAt: now.toISOString(),
    rulesChecked: rules.length,
    created: eventIds.length,
    eventIds,
  };
  await recordAudit(
    db,
    buildAuditEntry({ actorUserId: null, action: 'cron.draft_generate', targetTable: 'events', targetId: null, after: summary })
  );
  return summary;
}
