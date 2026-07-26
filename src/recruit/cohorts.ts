// F9 신입 모집 기수(cohorts) 관리 서비스
import { db } from '../db/client';
import { recruitCohorts } from '../db/schema';
import { eq, desc } from 'drizzle-orm';

export interface CreateCohortInput {
  label: string;
  createdBy: string;
}

export async function createCohort(input: CreateCohortInput) {
  const [created] = await db
    .insert(recruitCohorts)
    .values({
      label: input.label,
      createdBy: input.createdBy,
    })
    .returning();
  return created;
}

export async function listCohorts() {
  return db.select().from(recruitCohorts).orderBy(desc(recruitCohorts.createdAt));
}

export async function getCohortById(id: string) {
  const [found] = await db.select().from(recruitCohorts).where(eq(recruitCohorts.id, id));
  return found ?? null;
}

export async function updateCohortPublicSwitches(
  id: string,
  switches: { schedulePublic?: boolean; resultPublic?: boolean }
) {
  const updateData: Record<string, any> = {};
  if (switches.schedulePublic !== undefined) updateData.schedulePublic = switches.schedulePublic;
  if (switches.resultPublic !== undefined) updateData.resultPublic = switches.resultPublic;

  if (Object.keys(updateData).length === 0) return getCohortById(id);

  const [updated] = await db
    .update(recruitCohorts)
    .set(updateData)
    .where(eq(recruitCohorts.id, id))
    .returning();
  return updated;
}

export async function deleteCohort(id: string) {
  const [deleted] = await db
    .delete(recruitCohorts)
    .where(eq(recruitCohorts.id, id))
    .returning();
  return deleted ?? null;
}


