// F9 신입 모집 면접 슬롯 관리 서비스
import { db } from '../db/client';
import { recruitSlots } from '../db/schema';
import { eq, asc } from 'drizzle-orm';

export interface CreateSlotInput {
  cohortId: string;
  startsAt: Date;
  durationMin?: number;
  link?: string | null;
  venue?: string | null;
  isRemote?: boolean;
  createdBy: string;
}

export async function createSlot(input: CreateSlotInput) {
  const [created] = await db
    .insert(recruitSlots)
    .values({
      cohortId: input.cohortId,
      startsAt: input.startsAt,
      durationMin: input.durationMin ?? 20,
      link: input.link ?? null,
      venue: input.venue ?? null,
      isRemote: input.isRemote ?? false,
      createdBy: input.createdBy,
    })
    .returning();
  return created;
}

export async function listSlotsByCohort(cohortId: string) {
  return db
    .select()
    .from(recruitSlots)
    .where(eq(recruitSlots.cohortId, cohortId))
    .orderBy(asc(recruitSlots.startsAt));
}

export async function deleteSlot(slotId: string) {
  await db.delete(recruitSlots).where(eq(recruitSlots.id, slotId));
}
