// 회원(계정) 권한 관리 — 회장단·시스템관리자 전용. 목록 조회 + 역할 지정 + 활성/비활성.
// 보안(3중): 페이지 requireBoard 리다이렉트 + 라우트 isPrivileged 403 + 서비스 membership.manage 검증. 모든 변경 audit.
// 에스컬레이션 방지:
//  - 자기 자신은 변경 불가(자가 승격/락아웃 방지).
//  - sysadmin 역할은 sysadmin 만 부여·회수·비활성화.
//  - 마지막 활성 sysadmin 은 강등·비활성화 불가.

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@/db/types';
import { users, memberships, teamMembers } from '@/db/schema';
import { isPrivileged, type Actor, type Role } from '@/auth/permissions';
import { requireAuthorized } from '@/auth/guard';
import { buildAuditEntry, recordAudit } from '@/auth/audit';
import { privilegedAlertRecipients } from '@/auth/operators';
import { defaultMailer, type Mailer } from '@/auth/mailer';

const SYSTEM_EMAIL = 'system@animalmate.local';
const ROLE_RANK: Record<Role, number> = { member: 0, staff: 1, board: 2, sysadmin: 2 };
export const ASSIGNABLE_ROLES: Role[] = ['member', 'staff', 'board', 'sysadmin'];

/**
 * 권한이 **줄어드는** 변경인가(강등). 강등·비활성화 시 세션을 끊는 판단에 쓴다.
 *
 * ROLE_RANK 에서 board 와 sysadmin 은 같은 등급이지만, sysadmin 에게만 열린 조작
 * (sysadmin 부여·회수, sysadmin 계정 비활성화)이 있으므로 sysadmin → 그 외는 축소로 본다.
 */
export function isDemotion(from: Role, to: Role): boolean {
  if (from === to) return false;
  if (from === 'sysadmin') return true; // sysadmin 전용 권한 상실
  return ROLE_RANK[to] < ROLE_RANK[from];
}

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
  constructor(
    readonly code:
      | 'not_found'
      | 'self_forbidden'
      | 'sysadmin_only'
      | 'no_membership'
      | 'last_sysadmin'
      | 'last_privileged'
      | 'bad_role'
  ) {
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

/**
 * 회장단 대상 권한 변경을 나머지 회장단 전원 + 공용 메일에 알린다.
 *
 * 왜 코드로 막지 않고 알리는가(2026-07-24 결정): 회장단끼리는 상호 신뢰가 전제다.
 * sysadmin 만 회장단을 강등할 수 있게 하면 개발자가 졸업 후 거버넌스의 단일 병목이 된다.
 * 회장단 교체·유고 대응은 회장단이 스스로 할 수 있어야 하므로, 상호 견제는 **가시성**으로 푼다.
 *
 * 알림 실패가 권한 변경 자체를 되돌리지는 않는다(이미 커밋된 행위) — 대신 audit 에 남긴다.
 */
async function notifyPrivilegedChange(
  db: Db,
  actor: Actor,
  info: { targetUserId: string; summary: string; detail?: string },
  mailer: Mailer = defaultMailer()
): Promise<void> {
  try {
    const to = await privilegedAlertRecipients(db);
    if (to.length === 0) return;
    const [[who], [target]] = await Promise.all([
      db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, actor.userId)).limit(1),
      db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, info.targetUserId)).limit(1),
    ]);
    await mailer.send({
      to,
      subject: '[애니멀메이트] ⚠️ 회장단 권한 변경 알림',
      text:
        `${info.summary}\n\n` +
        `• 대상: ${target?.name ?? '(알 수 없음)'} <${target?.email ?? info.targetUserId}>\n` +
        `• 수행: ${who?.name ?? '(알 수 없음)'} <${who?.email ?? actor.userId}>\n` +
        `• 시각: ${new Date().toISOString()}\n\n` +
        `${info.detail ?? ''}\n` +
        `본인이 알지 못하는 변경이라면 즉시 다른 회장단과 확인해 주세요. 전체 이력은 audit_logs 에 남아 있습니다.`,
    });
  } catch (e) {
    await recordAudit(
      db,
      buildAuditEntry({
        actorUserId: actor.userId,
        action: 'membership.alert_failed',
        targetTable: 'users',
        targetId: info.targetUserId,
        after: { error: e instanceof Error ? e.message : String(e) },
        severity: 'high',
      })
    );
  }
}

/**
 * 이 변경이 **마지막 권한자를 없애는가**(= 아무도 권한을 되돌릴 수 없게 되는가).
 *
 * 순수 함수로 뺀 이유: 실제 판단은 "DB 전체의 활성 권한자 수"라는 전역 상태에 달려 있어서
 * 공용 DB 를 쓰는 통합 테스트로는 검증할 수 없다(실 계정이 이미 여러 명 있으면 조건이 성립하지 않음).
 * 규칙 자체는 여기서 단위 테스트로 고정하고, DB 조회는 activePrivilegedCount 가 담당한다.
 *
 * @param newRole 강등 후 역할. 비활성화(계정 자체를 내리는 경우)는 null 을 준다.
 */
export function wouldRemoveLastPrivileged(
  currentRole: Role | null,
  newRole: Role | null,
  activePrivileged: number
): boolean {
  if (currentRole == null || !isPrivileged(currentRole)) return false; // 애초에 권한자가 아니었다
  if (newRole != null && isPrivileged(newRole)) return false; // 권한자 → 권한자(board ↔ sysadmin)는 안전
  return activePrivileged <= 1;
}

/**
 * 활성 회장단·시스템관리자(= membership.manage 를 가진 계정) 수.
 * 이 값이 0 이 되면 아무도 권한을 되돌릴 수 없어 동아리가 콘솔에서 잠긴다(부트스트랩 스크립트 필요).
 */
async function activePrivilegedCount(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${memberships.userId})::int` })
    .from(memberships)
    .where(and(inArray(memberships.role, ['board', 'sysadmin']), eq(memberships.status, 'active')));
  return row?.n ?? 0;
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
  // 마지막 권한자(회장단·시스템관리자)를 강등하면 아무도 권한을 되돌릴 수 없다 — 전원 잠금 방지.
  if (wouldRemoveLastPrivileged(currentRole, newRole, await activePrivilegedCount(db))) {
    throw new MemberError('last_privileged');
  }

  if (currentRole === newRole) return;

  await db.update(memberships).set({ role: newRole }).where(and(eq(memberships.userId, targetUserId), eq(memberships.status, 'active')));

  // 강등이면 세션도 끊는다 — 역할이 줄었는데 이전 역할로 발급된 토큰이 살아 있을 이유가 없다.
  // (인가는 이미 매 요청 DB 에서 역할을 다시 읽으므로 권한 상승이 남아 있진 않지만,
  //  퇴출·계정 이상 상황에서 읽기 접근이 그대로 유지되는 것 자체가 리스크다. 2026-07-24 결정 13)
  const demoted = isDemotion(currentRole, newRole);
  if (demoted) await bumpSessionVersion(db, targetUserId);

  // 회장단이 관여된 변경(강등이든 승격이든)은 눈에 띄게 남긴다.
  const touchesPrivileged = isPrivileged(currentRole) || isPrivileged(newRole);
  await recordAudit(
    db,
    buildAuditEntry({
      actorUserId: actor.userId,
      action: 'membership.set_role',
      targetTable: 'memberships',
      targetId: targetUserId,
      before: { role: currentRole },
      after: { role: newRole, sessionsRevoked: demoted },
      severity: touchesPrivileged ? 'high' : undefined,
    })
  );
  if (touchesPrivileged) {
    await notifyPrivilegedChange(db, actor, {
      targetUserId,
      summary: `회장단 권한이 변경되었습니다: ${currentRole} → ${newRole}`,
    });
  }
}

/**
 * 세션 세대를 1 올린다 = 그 계정의 모든 기기 로그아웃. 새 세대 값을 돌려준다.
 * 명시적인 "모든 기기에서 로그아웃" 과 강등·비활성화가 공유한다.
 */
async function bumpSessionVersion(db: Db, userId: string): Promise<number | undefined> {
  const [row] = await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, userId))
    .returning({ sessionVersion: users.sessionVersion });
  return row?.sessionVersion;
}

/**
 * 그 계정의 모든 기기 세션을 즉시 무효화(users.session_version + 1).
 * 기기 분실·계정 공유 정리·유출 의심에 쓴다. 세션은 stateless JWT 라 "취소"가 불가능한데,
 * 세대 번호를 올리면 이전 세대로 서명된 토큰이 전부 한 번에 무효가 된다(loadActor 가 대조).
 *
 * 대상 제한은 역할 변경과 같게 둔다 — 남의 세션을 끊는 것은 권한 회수만큼 강한 행위다.
 */
export async function revokeSessions(db: Db, actor: Actor, targetUserId: string): Promise<void> {
  requireAuthorized(actor, { kind: 'membership.manage' });

  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, targetUserId)).limit(1);
  if (!target) throw new MemberError('not_found');

  const currentRole = await activeRoleOf(db, targetUserId);
  // sysadmin 의 세션을 끊는 것은 sysadmin 만(회장단이 시스템관리자를 밀어내지 못하게).
  if (currentRole === 'sysadmin' && actor.role !== 'sysadmin') throw new MemberError('sysadmin_only');

  const newVersion = await bumpSessionVersion(db, targetUserId);

  await recordAudit(
    db,
    buildAuditEntry({
      actorUserId: actor.userId,
      action: 'session.revoke_all',
      targetTable: 'users',
      targetId: targetUserId,
      after: { sessionVersion: newVersion },
      // 회장단 이상을 강제 로그아웃시키는 것은 눈에 띄어야 한다.
      severity: currentRole && isPrivileged(currentRole) ? 'high' : undefined,
    })
  );

  if (currentRole && isPrivileged(currentRole)) {
    await notifyPrivilegedChange(db, actor, {
      targetUserId,
      summary: '회장단 계정의 모든 기기 세션이 강제 로그아웃되었습니다.',
      detail: '기기 분실·유출 대응이 아니라면 즉시 확인이 필요합니다.',
    });
  }
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
  // 마지막 남은 권한자를 비활성화하면 콘솔에서 아무도 되돌릴 수 없다 — 전원 잠금 방지.
  if (!active && wouldRemoveLastPrivileged(currentRole, null, await activePrivilegedCount(db))) {
    throw new MemberError('last_privileged');
  }

  await db.update(memberships).set({ status: active ? 'active' : 'expired' }).where(eq(memberships.userId, targetUserId));

  // 비활성화의 의도는 "이 사람의 접근을 지금 끊는다" 다. 세션을 남겨 두면 쓰기는 막혀도
  // 화면 열람이 계속되어 의도와 어긋난다 — 특히 운영진 퇴출·계정 이상 상황에서 읽기 접근이
  // 그대로면 그 자체가 리스크다. 재활성화는 끊을 이유가 없으므로 올리지 않는다. (결정 13)
  if (!active) await bumpSessionVersion(db, targetUserId);

  const touchesPrivileged = currentRole != null && isPrivileged(currentRole);
  await recordAudit(
    db,
    buildAuditEntry({
      actorUserId: actor.userId,
      action: active ? 'membership.activate' : 'membership.deactivate',
      targetTable: 'memberships',
      targetId: targetUserId,
      after: { active, sessionsRevoked: !active },
      severity: touchesPrivileged ? 'high' : undefined,
    })
  );
  if (touchesPrivileged) {
    await notifyPrivilegedChange(db, actor, {
      targetUserId,
      summary: `회장단 계정이 ${active ? '활성화' : '비활성화'}되었습니다.`,
    });
  }
}
