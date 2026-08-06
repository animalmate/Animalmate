// F9 면접 슬롯별 운영진(면접관) 배정 관리 서비스
import { db } from '../db/client';
import { recruitSlotInterviewers, users, memberships } from '../db/schema';
import { eq, and, inArray, isNull } from 'drizzle-orm';
import type { Role } from '../auth/permissions';

/** 슬롯에 배정된 면접관 한 명. 화면은 이름만 쓰지만 해제 요청에 userId 가 필요하다. */
export interface SlotInterviewer {
  id: string;
  slotId: string;
  userId: string;
  name: string;
  /** 활성 멤버십이 없으면 null(탈퇴·만료된 뒤에도 지난 배정 기록은 남는다). */
  role: Role | null;
}

/**
 * 면접관으로 세울 수 있는 사람인가 = **활성 임기의 운영진 이상**.
 *
 * 화면 드롭다운이 `/api/recruit/staff` 목록만 보여주지만 그것은 검증이 아니다(규칙 #6).
 * 임의의 user id 가 통과하면 부원이나 탈퇴한 사람이 면접 시간표에 서고, 그 칸은 당일에야
 * "이 사람 누구지"로 발견된다.
 */
export async function isAssignableInterviewer(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(memberships, eq(users.id, memberships.userId))
    .where(
      and(
        eq(users.id, userId),
        isNull(users.withdrawnAt),
        eq(memberships.status, 'active'),
        inArray(memberships.role, ['staff', 'board', 'sysadmin'])
      )
    )
    .limit(1);
  return !!row;
}

export async function addSlotInterviewer(slotId: string, userId: string) {
  const [created] = await db
    .insert(recruitSlotInterviewers)
    .values({ slotId, userId })
    .onConflictDoNothing()
    .returning();
  return created ?? null;
}

export async function removeSlotInterviewer(slotId: string, userId: string) {
  const [deleted] = await db
    .delete(recruitSlotInterviewers)
    .where(
      and(
        eq(recruitSlotInterviewers.slotId, slotId),
        eq(recruitSlotInterviewers.userId, userId)
      )
    )
    .returning();
  return deleted ?? null;
}

// 이메일은 내려보내지 않는다 — 화면이 쓰는 것은 이름뿐인데 실으면 운영진 주소록이
// 모집 화면을 여는 모든 운영진의 브라우저로 흘러간다(최소 노출).
export async function getSlotInterviewers(slotId: string): Promise<SlotInterviewer[]> {
  return db
    .select({
      id: recruitSlotInterviewers.id,
      slotId: recruitSlotInterviewers.slotId,
      userId: recruitSlotInterviewers.userId,
      name: users.name,
      role: memberships.role,
    })
    .from(recruitSlotInterviewers)
    .innerJoin(users, eq(recruitSlotInterviewers.userId, users.id))
    .leftJoin(memberships, and(eq(users.id, memberships.userId), eq(memberships.status, 'active')))
    .where(eq(recruitSlotInterviewers.slotId, slotId));
}

export async function getSlotsInterviewersMap(slotIds: string[]): Promise<Record<string, SlotInterviewer[]>> {
  if (slotIds.length === 0) return {};
  const rows = await db
    .select({
      id: recruitSlotInterviewers.id,
      slotId: recruitSlotInterviewers.slotId,
      userId: recruitSlotInterviewers.userId,
      name: users.name,
      role: memberships.role,
    })
    .from(recruitSlotInterviewers)
    .innerJoin(users, eq(recruitSlotInterviewers.userId, users.id))
    .leftJoin(memberships, and(eq(users.id, memberships.userId), eq(memberships.status, 'active')))
    .where(inArray(recruitSlotInterviewers.slotId, slotIds));

  const map: Record<string, SlotInterviewer[]> = {};
  for (const r of rows) {
    if (!map[r.slotId]) map[r.slotId] = [];
    map[r.slotId]!.push(r);
  }
  return map;
}
