// F9 화면별 공용 메모지 서비스 (운영진 공유)
import { db } from '../db/client';
import { screenNotes } from '../db/schema';
import { eq } from 'drizzle-orm';

export async function upsertScreenNote(
  contextKey: string,
  content: string,
  updatedBy: string
) {
  const [updated] = await db
    .insert(screenNotes)
    .values({
      contextKey,
      content,
      updatedBy,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [screenNotes.contextKey],
      set: {
        content,
        updatedBy,
        updatedAt: new Date(),
      },
    })
    .returning();
  return updated;
}

export async function getScreenNote(contextKey: string) {
  const [found] = await db
    .select()
    .from(screenNotes)
    .where(eq(screenNotes.contextKey, contextKey));
  return found ?? null;
}
