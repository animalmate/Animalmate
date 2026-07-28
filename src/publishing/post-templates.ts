// 발행 템플릿(post_templates) CRUD — 팀/개인 소유 + global(공용). 렌더링 유틸 포함.
// 소유권: team/personal 은 template.manage(소유자/회장단), global 은 회장단만 편집·전원 사용.

import { and, asc, eq, ne, or } from 'drizzle-orm';
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

/**
 * 이 양식을 **고칠 수 있는가**(수정·삭제) — 화면이 버튼을 띄울지 정하는 데 쓴다.
 *
 * 쓰는 범위가 넓어진 뒤로(모든 팀 양식이 목록에 보인다) 이 판정이 필요해졌다. 없으면 남의 팀
 * 양식에도 수정 버튼이 떠서 누를 때마다 403 이 난다 — UI 숨김은 권한이 아니지만(규칙 #6),
 * **할 수 없는 일을 할 수 있는 것처럼 보여주지 않는 것**은 여전히 화면의 몫이다(07-DECISIONS 32·36).
 *
 * 판정을 새로 쓰지 않고 `authorizeTemplate` 을 그대로 부른다. 규칙을 두 벌 두면 반드시 갈라지고,
 * 갈라진 순간 "버튼은 있는데 안 되는" 또는 "되는데 버튼이 없는" 화면이 된다.
 */
export function canEditTemplate(
  actor: Actor,
  ownerType: TemplateOwnerType,
  ownerId: string | null | undefined
): boolean {
  try {
    authorizeTemplate(actor, ownerType, ownerId);
    return true;
  } catch {
    return false;
  }
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
 * 사용자가 "양식 불러오기"로 쓸 수 있는 템플릿 = **개인 소유(남의 것)를 뺀 전부.**
 * 즉 global + 모든 팀 + 본인 개인. 역할에 따라 달라지지 않는다.
 *
 * 왜 소속 팀으로 좁히지 않는가(2026-07-28 변경): 예약을 만드는 것은 양식을 **베껴 쓰는** 일이다.
 * 제목·본문·기본값을 복사해 갈 뿐이라 남의 팀 양식을 참고해도 그 양식도 그 팀도 바뀌지 않는다.
 * 반면 좁혀 두면 팀 배정이 비어 있는 운영진은 global 밖에 못 써서 매번 처음부터 쓰게 됐다
 * (team_members 배정이 비어 있는 경우가 흔하다).
 *
 * **고치는 범위는 그대로다** — 수정·삭제는 여전히 소유자(본인/소속팀)와 회장단만 할 수 있다
 * (`template.manage` → `authorizeTemplate`). 보는 범위와 고치는 범위를 따로 두는 것이 요점이다.
 *
 * 남의 **개인** 양식만 뺀다. 개인 소유는 각자의 초안이라 남에게 제안할 것이 아니다.
 * (예전에는 회장단·시스템관리자에게 남의 개인 양식까지 보였다. 그 부분은 좁아졌다.)
 */
export async function listUsableTemplates(db: Database, actor: Actor): Promise<PostTemplate[]> {
  return db
    .select()
    .from(postTemplates)
    .where(
      or(
        ne(postTemplates.ownerType, 'personal'),
        and(eq(postTemplates.ownerType, 'personal'), eq(postTemplates.ownerId, actor.userId))
      )
    )
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
