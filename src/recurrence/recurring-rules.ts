// recurring_rules CRUD — 팀 소유 반복 규칙. 팀장단(소속 staff)·회장단만 관리 + audit.
// 03: recurring_rules(team_id, label, month_week, weekday, time, board_menuid, template_md, draft_lead_days, is_active).

import { and, asc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { recurringRules } from '@/db/schema';
import type * as schema from '@/db/schema';
import type { Actor } from '@/auth/permissions';
import { requireAuthorized } from '@/auth/guard';
import { buildAuditEntry, recordAudit } from '@/auth/audit';
import type { Weekday } from './month-weekday';

type DB = PostgresJsDatabase<typeof schema>;
export type RecurringRule = typeof recurringRules.$inferSelect;

export interface CreateRuleInput {
  teamId: string;
  label: string;
  monthWeek: '1' | '2' | '3' | '4' | 'last';
  weekday: Weekday;
  time: string; // 'HH:MM' 또는 'HH:MM:SS'
  boardMenuid: number;
  templateMd: string;
  draftLeadDays?: number; // 기본 3
  isActive?: boolean;
}

export type UpdateRulePatch = Partial<Omit<CreateRuleInput, 'teamId'>>;

const ownerOf = (teamId: string) => ({ ownerType: 'team' as const, ownerId: teamId });

export async function getRule(db: DB, id: string): Promise<RecurringRule | null> {
  const [row] = await db.select().from(recurringRules).where(eq(recurringRules.id, id)).limit(1);
  return row ?? null;
}

export async function listRules(
  db: DB,
  opts: { teamId?: string; activeOnly?: boolean } = {}
): Promise<RecurringRule[]> {
  const rows = await db
    .select()
    .from(recurringRules)
    .where(opts.teamId ? eq(recurringRules.teamId, opts.teamId) : undefined)
    .orderBy(asc(recurringRules.label));
  return opts.activeOnly ? rows.filter((r) => r.isActive) : rows;
}

/** 활성 규칙 전체(초안 생성 크론용). */
export async function listActiveRules(db: DB): Promise<RecurringRule[]> {
  return db.select().from(recurringRules).where(eq(recurringRules.isActive, true));
}

export async function createRule(db: DB, actor: Actor, input: CreateRuleInput): Promise<RecurringRule> {
  requireAuthorized(actor, { kind: 'recurring.manage', owner: ownerOf(input.teamId) });
  const [row] = await db
    .insert(recurringRules)
    .values({
      teamId: input.teamId,
      label: input.label,
      monthWeek: input.monthWeek,
      weekday: input.weekday,
      time: input.time,
      boardMenuid: input.boardMenuid,
      templateMd: input.templateMd,
      draftLeadDays: input.draftLeadDays ?? 3,
      isActive: input.isActive ?? true,
    })
    .returning();
  await recordAudit(
    db,
    buildAuditEntry({ actorUserId: actor.userId, action: 'recurring.create', targetTable: 'recurring_rules', targetId: row!.id, after: row })
  );
  return row!;
}

export async function updateRule(db: DB, actor: Actor, id: string, patch: UpdateRulePatch): Promise<RecurringRule> {
  const before = await getRule(db, id);
  if (!before) throw new Error(`recurring_rule not found: ${id}`);
  requireAuthorized(actor, { kind: 'recurring.manage', owner: ownerOf(before.teamId) });

  const set: Partial<RecurringRule> = {};
  if (patch.label !== undefined) set.label = patch.label;
  if (patch.monthWeek !== undefined) set.monthWeek = patch.monthWeek;
  if (patch.weekday !== undefined) set.weekday = patch.weekday;
  if (patch.time !== undefined) set.time = patch.time;
  if (patch.boardMenuid !== undefined) set.boardMenuid = patch.boardMenuid;
  if (patch.templateMd !== undefined) set.templateMd = patch.templateMd;
  if (patch.draftLeadDays !== undefined) set.draftLeadDays = patch.draftLeadDays;
  if (patch.isActive !== undefined) set.isActive = patch.isActive;

  const [row] = await db.update(recurringRules).set(set).where(eq(recurringRules.id, id)).returning();
  await recordAudit(
    db,
    buildAuditEntry({ actorUserId: actor.userId, action: 'recurring.update', targetTable: 'recurring_rules', targetId: id, before, after: row })
  );
  return row!;
}

/** 삭제 = 소프트 삭제(is_active=false). events.rule_id 이력 보존. */
export async function deleteRule(db: DB, actor: Actor, id: string): Promise<RecurringRule> {
  const before = await getRule(db, id);
  if (!before) throw new Error(`recurring_rule not found: ${id}`);
  requireAuthorized(actor, { kind: 'recurring.manage', owner: ownerOf(before.teamId) });
  const [row] = await db.update(recurringRules).set({ isActive: false }).where(eq(recurringRules.id, id)).returning();
  await recordAudit(
    db,
    buildAuditEntry({ actorUserId: actor.userId, action: 'recurring.delete', targetTable: 'recurring_rules', targetId: id, before, after: row })
  );
  return row!;
}
