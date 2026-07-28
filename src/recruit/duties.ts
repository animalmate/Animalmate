// 면접 당일 대기실 업무 배정 CRUD. 순수 규칙은 duty-rules.ts 에 있다.
import { db } from '../db/client';
import { recruitDutyAssignments, users } from '../db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { DUTY_ALL } from './duty-rules';

export async function listDutyAssignments(cohortId: string) {
  return db
    .select({
      id: recruitDutyAssignments.id,
      startsAt: recruitDutyAssignments.startsAt,
      duty: recruitDutyAssignments.duty,
      userId: recruitDutyAssignments.userId,
      note: recruitDutyAssignments.note,
      userName: users.name,
    })
    .from(recruitDutyAssignments)
    .leftJoin(users, eq(recruitDutyAssignments.userId, users.id))
    .where(eq(recruitDutyAssignments.cohortId, cohortId));
}

/**
 * 한 칸 저장. 같은 (기수, 시각, 업무) 를 다시 저장하면 덮어쓴다 —
 * 표의 칸을 고르는 조작이라 매번 행이 늘면 안 된다.
 * 사람을 비우면(=userId null, note 없음) 그 칸을 지운다.
 */
export async function setDutyAssignment(input: {
  cohortId: string;
  startsAt: Date;
  duty: string;
  userId: string | null;
  note: string | null;
  actorUserId: string;
}) {
  const { cohortId, startsAt, duty, userId, note, actorUserId } = input;

  const isEmpty = duty === DUTY_ALL ? !note?.trim() : !userId;
  if (isEmpty) {
    await db
      .delete(recruitDutyAssignments)
      .where(
        and(
          eq(recruitDutyAssignments.cohortId, cohortId),
          eq(recruitDutyAssignments.startsAt, startsAt),
          eq(recruitDutyAssignments.duty, duty)
        )
      );
    return null;
  }

  const [saved] = await db
    .insert(recruitDutyAssignments)
    .values({
      cohortId,
      startsAt,
      duty,
      userId: duty === DUTY_ALL ? null : userId,
      note: duty === DUTY_ALL ? note!.trim() : null,
      createdBy: actorUserId,
    })
    .onConflictDoUpdate({
      target: [recruitDutyAssignments.cohortId, recruitDutyAssignments.startsAt, recruitDutyAssignments.duty],
      set: {
        userId: duty === DUTY_ALL ? null : userId,
        note: duty === DUTY_ALL ? note!.trim() : null,
      },
    })
    .returning();
  return saved ?? null;
}

/**
 * 업무 이름이 바뀌면 없어진 이름의 배정은 남겨 둬도 화면에 뜨지 않는다(유령 행).
 * 기수 설정을 저장할 때 함께 정리한다.
 */
export async function pruneDutyAssignments(cohortId: string, keepRoles: string[]) {
  const rows = await db
    .select({ id: recruitDutyAssignments.id, duty: recruitDutyAssignments.duty })
    .from(recruitDutyAssignments)
    .where(eq(recruitDutyAssignments.cohortId, cohortId));

  const stale = rows.filter((r) => r.duty !== DUTY_ALL && !keepRoles.includes(r.duty)).map((r) => r.id);
  if (stale.length === 0) return 0;
  await db.delete(recruitDutyAssignments).where(inArray(recruitDutyAssignments.id, stale));
  return stale.length;
}
