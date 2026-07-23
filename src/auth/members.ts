// 회원(계정) 권한 관리 — 회장단·시스템관리자 전용. 목록 조회 + 역할 지정 + 활성/비활성.
// 보안(3중): 페이지 requireBoard 리다이렉트 + 라우트 isPrivileged 403 + 서비스 membership.manage 검증. 모든 변경 audit.
// 에스컬레이션 방지:
//  - 자기 자신은 변경 불가(자가 승격/락아웃 방지).
//  - sysadmin 역할은 sysadmin 만 부여·회수·비활성화.
//  - 마지막 활성 sysadmin 은 강등·비활성화 불가.

import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '@/db/types';
import { users, memberships, teamMembers } from '@/db/schema';
import { type Actor, type Role } from '@/auth/permissions';
import { requireAuthorized } from '@/auth/guard';
import { buildAuditEntry, recordAudit } from '@/auth/audit';

const SYSTEM_EMAIL = 'system@animalmate.local';
const ROLE_RANK: Record<Role, number> = { member: 0, staff: 1, board: 2, sysadmin: 2 };
export const ASSIGNABLE_ROLES: Role[] = ['member', 'staff', 'board', 'sysadmin'];

export interface MemberRow {
  userId: string;
  email: string;
  name: string;
  role: Role; // 멤버십 중 최고 역할(비활성 포함 — 무엇이었는지 표시)
  active: boolean; // 활성 멤버십 존재 여부
  teamCount: number; // 소속 팀 수
}

export class MemberError extends Error {
  readonly status = 400;
  constructor(readonly code: 'not_found' | 'self_forbidden' | 'sysadmin_only' | 'no_membership' | 'last_sysadmin' | 'bad_role') {
    super(code);
    this.name = 'MemberError';
  }
}

function ensureValidRole(role: string): asserts role is Role {
  if (!ASSIGNABLE_ROLES.includes(role as Role)) throw new MemberError('bad_role');
}

/** 전체 가입 계정 목록(시스템 계정 제외). 회장단/시스템관리자 전용(라우트에서 게이트). */
export async function listMembers(db: Db): Promise<MemberRow[]> {
  const us = await db.select({ id: users.id, email: users.email, name: users.name }).from(users).orderBy(desc(users.createdAt));
  const ms = await db.select({ userId: memberships.userId, role: memberships.role, status: memberships.status }).from(memberships);
  const tms = await db.select({ userId: teamMembers.userId }).from(teamMembers);

  const roleByUser = new Map<string, Role>();
  const activeByUser = new Set<string>();
  for (const m of ms) {
    const cur = roleByUser.get(m.userId);
    if (!cur || ROLE_RANK[m.role] > ROLE_RANK[cur]) roleByUser.set(m.userId, m.role);
    if (m.status === 'active') activeByUser.add(m.userId);
  }
  const teamCount = new Map<string, number>();
  for (const t of tms) teamCount.set(t.userId, (teamCount.get(t.userId) ?? 0) + 1);

  return us
    .filter((u) => u.email !== SYSTEM_EMAIL)
    .map((u) => ({
      userId: u.id,
      email: u.email,
      name: u.name,
      role: roleByUser.get(u.id) ?? 'member',
      active: activeByUser.has(u.id),
      teamCount: teamCount.get(u.id) ?? 0,
    }));
}

async function activeSysadminCount(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${memberships.userId})::int` })
    .from(memberships)
    .where(and(eq(memberships.role, 'sysadmin'), eq(memberships.status, 'active')));
  return row?.n ?? 0;
}

/** 대상 회원의 활성 최고 역할. 활성 멤버십이 없으면 null. */
async function activeRoleOf(db: Db, userId: string): Promise<Role | null> {
  const rows = await db.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.status, 'active')));
  if (rows.length === 0) return null;
  return rows.reduce<Role>((max, m) => (ROLE_RANK[m.role] > ROLE_RANK[max] ? m.role : max), 'member');
}

/** 회원 역할 지정(회장단/시스템관리자). 활성 멤버십의 역할을 교체. */
export async function setMemberRole(db: Db, actor: Actor, targetUserId: string, newRole: string): Promise<void> {
  requireAuthorized(actor, { kind: 'membership.manage' }); // board/sysadmin only (403 else)
  ensureValidRole(newRole);
  if (targetUserId === actor.userId) throw new MemberError('self_forbidden');

  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, targetUserId)).limit(1);
  if (!target) throw new MemberError('not_found');

  const currentRole = await activeRoleOf(db, targetUserId);
  if (currentRole === null) throw new MemberError('no_membership');

  // sysadmin 부여/회수는 sysadmin 만.
  if ((newRole === 'sysadmin' || currentRole === 'sysadmin') && actor.role !== 'sysadmin') throw new MemberError('sysadmin_only');
  // 마지막 활성 sysadmin 강등 금지.
  if (currentRole === 'sysadmin' && newRole !== 'sysadmin' && (await activeSysadminCount(db)) <= 1) throw new MemberError('last_sysadmin');

  if (currentRole === newRole) return;

  await db.update(memberships).set({ role: newRole }).where(and(eq(memberships.userId, targetUserId), eq(memberships.status, 'active')));
  await recordAudit(db, buildAuditEntry({ actorUserId: actor.userId, action: 'membership.set_role', targetTable: 'memberships', targetId: targetUserId, before: { role: currentRole }, after: { role: newRole } }));
}

/** 회원 활성/비활성(접근 회수/복구). 비활성 = 모든 멤버십 status=expired → 쓰기 전면 차단. */
export async function setMemberActive(db: Db, actor: Actor, targetUserId: string, active: boolean): Promise<void> {
  requireAuthorized(actor, { kind: 'membership.manage' });
  if (targetUserId === actor.userId) throw new MemberError('self_forbidden');

  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, targetUserId)).limit(1);
  if (!target) throw new MemberError('not_found');

  const currentRole = await activeRoleOf(db, targetUserId);
  // sysadmin 비활성화는 sysadmin 만 + 마지막 보호.
  if (currentRole === 'sysadmin') {
    if (actor.role !== 'sysadmin') throw new MemberError('sysadmin_only');
    if (!active && (await activeSysadminCount(db)) <= 1) throw new MemberError('last_sysadmin');
  }

  await db.update(memberships).set({ status: active ? 'active' : 'expired' }).where(eq(memberships.userId, targetUserId));
  await recordAudit(db, buildAuditEntry({ actorUserId: actor.userId, action: active ? 'membership.activate' : 'membership.deactivate', targetTable: 'memberships', targetId: targetUserId, after: { active } }));
}
