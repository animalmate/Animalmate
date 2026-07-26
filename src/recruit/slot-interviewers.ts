// F9 면접 슬롯별 운영진(면접관) 배정 관리 서비스
import { db } from '../db/client';
import { recruitSlotInterviewers, users, memberships } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';

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

export async function getSlotInterviewers(slotId: string) {
  return db
    .select({
      id: recruitSlotInterviewers.id,
      slotId: recruitSlotInterviewers.slotId,
      userId: recruitSlotInterviewers.userId,
      name: users.name,
      email: users.email,
      role: memberships.role,
    })
    .from(recruitSlotInterviewers)
    .innerJoin(users, eq(recruitSlotInterviewers.userId, users.id))
    .leftJoin(memberships, and(eq(users.id, memberships.userId), eq(memberships.status, 'active')))
    .where(eq(recruitSlotInterviewers.slotId, slotId));
}

export async function getSlotsInterviewersMap(slotIds: string[]) {
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

  const map: Record<string, any[]> = {};
  for (const r of rows) {
    if (!map[r.slotId]) map[r.slotId] = [];
    map[r.slotId]!.push(r);
  }
  return map;
}
