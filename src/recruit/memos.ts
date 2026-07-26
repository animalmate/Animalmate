// F9 지원자별 개인 메모 서비스 (작성자당 1개)
import { db } from '../db/client';
import { recruitMemos } from '../db/schema';
import { eq, and } from 'drizzle-orm';

export async function upsertPersonalMemo(
  applicantId: string,
  authorUserId: string,
  content: string
) {
  const [updated] = await db
    .insert(recruitMemos)
    .values({
      applicantId,
      authorUserId,
      content,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [recruitMemos.applicantId, recruitMemos.authorUserId],
      set: {
        content,
        updatedAt: new Date(),
      },
    })
    .returning();
  return updated;
}

export async function getPersonalMemo(applicantId: string, authorUserId: string) {
  const [found] = await db
    .select()
    .from(recruitMemos)
    .where(
      and(
        eq(recruitMemos.applicantId, applicantId),
        eq(recruitMemos.authorUserId, authorUserId)
      )
    );
  return found ?? null;
}
