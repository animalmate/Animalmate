// 발행 템플릿(post_templates) CRUD — 팀/개인 소유 + global(공용). 렌더링 유틸 포함.
// 소유권: team/personal 은 template.manage(소유자/회장단), global 은 회장단만 편집·전원 사용.

import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { postTemplates } from '@/db/schema';
import type { Db, Database } from '@/db/types';
import type { Actor } from '@/auth/permissions';
import { isPrivileged } from '@/auth/permissions';
import { requireAuthorized, PermissionError } from '@/auth/guard';
import { buildAuditEntry, recordAudit } from '@/auth/audit';

// 치환 로직은 순수 모듈에 있다(클라이언트 미리보기 공용). 기존 호출부 호환을 위해 재수출.
export { renderTemplate, placeholderKeys } from './template-render';

export type PostTemplate = typeof postTemplates.$inferSelect;
export type TemplateOwnerType = 'personal' | 'team' | 'global';

export interface CreateTemplateInput {
  ownerType: TemplateOwnerType;
  ownerId?: string | null; // team=teamId, personal=userId, global=null
  name: string;
  titleTemplate: string;
  bodyTemplate: string;
  /** 양식별 기본값 — 예약을 만들 때 각 일정에 미리 채워지고 회차별로 고칠 수 있다. */
  defaultPlace?: string | null;
  defaultCapacity?: number | null;
  defaultMeetTime?: string | null; // 'HH:MM'
  defaultPublishTime?: string | null; // 'HH:MM'
}

export type UpdateTemplatePatch = Partial<
  Pick<
    CreateTemplateInput,
    'name' | 'titleTemplate' | 'bodyTemplate' | 'defaultPlace' | 'defaultCapacity' | 'defaultMeetTime' | 'defaultPublishTime'
  >
>;

// global 은 회장단만, team/personal 은 소유권(소유자/회장단) 검사.
function authorizeTemplate(actor: Actor, ownerType: TemplateOwnerType, ownerId: string | null | undefined): void {
  if (ownerType === 'global') {
    if (!isPrivileged(actor.role)) throw new PermissionError('role_insufficient');
    return;
  }
  if (!ownerId) throw new PermissionError('not_owner');
  requireAuthorized(actor, { kind: 'template.manage', owner: { ownerType, ownerId } });
}

// ── 폼 입력 정규화 ─────────────────────────────────────────────────────
// undefined = 이번 요청에서 다루지 않음(패치 시 유지), null = 비움.
export function parseDefaultPlace(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
}

/** 'HH:MM'(폼 time 입력) 만 받는다. 형식이 아니면 비운 것으로 본다. */
export function parseDefaultTime(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  const s = String(v ?? '').trim();
  return /^\d{2}:\d{2}$/.test(s) ? s : null;
}

export function parseDefaultCapacity(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  const s = String(v ?? '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function getTemplate(db: Database, id: string): Promise<PostTemplate | null> {
  const [row] = await db.select().from(postTemplates).where(eq(postTemplates.id, id)).limit(1);
  return row ?? null;
}

/**
 * 사용자가 "양식 불러오기"로 쓸 수 있는 템플릿.
 * - 회장단/시스템관리자: 전체(팀 템플릿을 팀 대신 중앙에서 만들고 관리하므로 소속과 무관하게 모두 보인다).
 * - 그 외 운영진: global + 본인 개인 + 소속 팀.
 * (team_members 배정 UI가 없어 일반 운영진의 팀 소속은 비어 있을 수 있음 — 팀 템플릿은 회장단이 관리한다.)
 */
export async function listUsableTemplates(db: Database, actor: Actor): Promise<PostTemplate[]> {
  if (isPrivileged(actor.role)) {
    return db.select().from(postTemplates).orderBy(asc(postTemplates.name));
  }
  const teamIds = actor.teams.map((t) => t.teamId);
  const conds = [
    eq(postTemplates.ownerType, 'global'),
    and(eq(postTemplates.ownerType, 'personal'), eq(postTemplates.ownerId, actor.userId)),
    teamIds.length
      ? and(eq(postTemplates.ownerType, 'team'), inArray(postTemplates.ownerId, teamIds))
      : undefined,
  ].filter(Boolean);
  return db
    .select()
    .from(postTemplates)
    .where(or(...conds))
    .orderBy(asc(postTemplates.name));
}

export async function createTemplate(db: Db, actor: Actor, input: CreateTemplateInput): Promise<PostTemplate> {
  const ownerId = input.ownerType === 'global' ? null : input.ownerId;
  authorizeTemplate(actor, input.ownerType, ownerId);
  const [row] = await db
    .insert(postTemplates)
    .values({
      ownerType: input.ownerType,
      ownerId: ownerId ?? null,
      name: input.name,
      titleTemplate: input.titleTemplate,
      bodyTemplate: input.bodyTemplate,
      defaultPlace: input.defaultPlace ?? null,
      defaultCapacity: input.defaultCapacity ?? null,
      defaultMeetTime: input.defaultMeetTime ?? null,
      defaultPublishTime: input.defaultPublishTime ?? null,
      updatedBy: actor.userId,
    })
    .returning();
  await recordAudit(
    db,
    buildAuditEntry({ actorUserId: actor.userId, action: 'template.create', targetTable: 'post_templates', targetId: row!.id, after: row })
  );
  return row!;
}

export async function updateTemplate(db: Db, actor: Actor, id: string, patch: UpdateTemplatePatch): Promise<PostTemplate> {
  const before = await getTemplate(db, id);
  if (!before) throw new Error(`post_template not found: ${id}`);
  authorizeTemplate(actor, before.ownerType as TemplateOwnerType, before.ownerId);
  const set: Partial<PostTemplate> = { updatedBy: actor.userId, updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.titleTemplate !== undefined) set.titleTemplate = patch.titleTemplate;
  if (patch.bodyTemplate !== undefined) set.bodyTemplate = patch.bodyTemplate;
  if (patch.defaultPlace !== undefined) set.defaultPlace = patch.defaultPlace;
  if (patch.defaultCapacity !== undefined) set.defaultCapacity = patch.defaultCapacity;
  if (patch.defaultMeetTime !== undefined) set.defaultMeetTime = patch.defaultMeetTime;
  if (patch.defaultPublishTime !== undefined) set.defaultPublishTime = patch.defaultPublishTime;
  const [row] = await db.update(postTemplates).set(set).where(eq(postTemplates.id, id)).returning();
  await recordAudit(
    db,
    buildAuditEntry({ actorUserId: actor.userId, action: 'template.update', targetTable: 'post_templates', targetId: id, before, after: row })
  );
  return row!;
}

/** 삭제(하드). recurring_rules.template_id 는 set null 로 정리됨. */
export async function deleteTemplate(db: Db, actor: Actor, id: string): Promise<void> {
  const before = await getTemplate(db, id);
  if (!before) throw new Error(`post_template not found: ${id}`);
  authorizeTemplate(actor, before.ownerType as TemplateOwnerType, before.ownerId);
  await db.delete(postTemplates).where(eq(postTemplates.id, id));
  await recordAudit(
    db,
    buildAuditEntry({ actorUserId: actor.userId, action: 'template.delete', targetTable: 'post_templates', targetId: id, before })
  );
}
