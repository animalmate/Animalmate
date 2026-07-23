// 발행 템플릿(post_templates) CRUD — 팀/개인 소유 + global(공용). 렌더링 유틸 포함.
// 소유권: team/personal 은 template.manage(소유자/회장단), global 은 회장단만 편집·전원 사용.

import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { postTemplates } from '@/db/schema';
import type { Db, Database } from '@/db/types';
import type { Actor } from '@/auth/permissions';
import { isPrivileged } from '@/auth/permissions';
import { requireAuthorized, PermissionError } from '@/auth/guard';
import { buildAuditEntry, recordAudit } from '@/auth/audit';

export type PostTemplate = typeof postTemplates.$inferSelect;
export type TemplateOwnerType = 'personal' | 'team' | 'global';

export interface CreateTemplateInput {
  ownerType: TemplateOwnerType;
  ownerId?: string | null; // team=teamId, personal=userId, global=null
  name: string;
  titleTemplate: string;
  bodyTemplate: string;
}

export type UpdateTemplatePatch = Partial<Pick<CreateTemplateInput, 'name' | 'titleTemplate' | 'bodyTemplate'>>;

// global 은 회장단만, team/personal 은 소유권(소유자/회장단) 검사.
function authorizeTemplate(actor: Actor, ownerType: TemplateOwnerType, ownerId: string | null | undefined): void {
  if (ownerType === 'global') {
    if (!isPrivileged(actor.role)) throw new PermissionError('role_insufficient');
    return;
  }
  if (!ownerId) throw new PermissionError('not_owner');
  requireAuthorized(actor, { kind: 'template.manage', owner: { ownerType, ownerId } });
}

export async function getTemplate(db: Database, id: string): Promise<PostTemplate | null> {
  const [row] = await db.select().from(postTemplates).where(eq(postTemplates.id, id)).limit(1);
  return row ?? null;
}

/** 사용자가 "양식 불러오기"로 쓸 수 있는 템플릿: global + 소속 팀 + 본인 개인. */
export async function listUsableTemplates(db: Database, actor: Actor): Promise<PostTemplate[]> {
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

/** 플레이스홀더 치환. 값이 없는 키는 그대로 둔다(팀장단이 이후 채움). */
export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (m, key: string) => vars[key] ?? m);
}
