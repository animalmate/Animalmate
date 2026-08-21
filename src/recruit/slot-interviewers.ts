// F9 면접 슬롯별 운영진(면접관) 배정 관리 서비스
import { db } from '../db/client';
import { recruitSlotInterviewers, users, memberships } from '../db/schema';
import { eq, and, inArray, isNull, sql } from 'drizzle-orm';
import type { Role } from '../auth/permissions';

/** 슬롯에 배정된 면접관 한 명. 화면은 이름만 쓰지만 해제 요청에 userId 가 필요하다. */
export interface SlotInterviewer {
  id: string;
  slotId: string;
  /** 계정이 연결돼 있으면 그 id. 이름만 적은 사람은 null — 시간표에는 뜨지만 채점은 못 한다. */
  userId: string | null;
  name: string;
  /** 활성 멤버십이 없으면 null(탈퇴·만료된 뒤에도, 이름만 적은 사람도 null). */
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
      // 계정이 있으면 users.name 이 원본이다(이름을 고치면 시간표도 따라간다).
      // 없으면 그 칸에 직접 적은 이름을 쓴다. innerJoin 이면 계정 없는 사람이 통째로 사라진다.
      name: sql<string>`coalesce(${users.name}, ${recruitSlotInterviewers.name})`,
      role: memberships.role,
    })
    .from(recruitSlotInterviewers)
    .leftJoin(users, eq(recruitSlotInterviewers.userId, users.id))
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
      // 계정이 있으면 users.name 이 원본이다(이름을 고치면 시간표도 따라간다).
      // 없으면 그 칸에 직접 적은 이름을 쓴다. innerJoin 이면 계정 없는 사람이 통째로 사라진다.
      name: sql<string>`coalesce(${users.name}, ${recruitSlotInterviewers.name})`,
      role: memberships.role,
    })
    .from(recruitSlotInterviewers)
    .leftJoin(users, eq(recruitSlotInterviewers.userId, users.id))
    .leftJoin(memberships, and(eq(users.id, memberships.userId), eq(memberships.status, 'active')))
    .where(inArray(recruitSlotInterviewers.slotId, slotIds));

  const map: Record<string, SlotInterviewer[]> = {};
  for (const r of rows) {
    if (!map[r.slotId]) map[r.slotId] = [];
    map[r.slotId]!.push(r);
  }
  return map;
}

/**
 * 여러 슬롯의 면접관을 **한 벌로 덮어쓴다** — 엑셀의 채우기 핸들(드래그 복사)에 해당한다.
 *
 * 왜 필요한가: 지난 기수 표를 보면 같은 면접관 3명이 연속 3~6칸을 그대로 맡는다
 * (한 조가 10:30~12:00 을 맡고, 그다음 조가 12:00~13:30 을 맡는 식).
 * 칸마다 드롭다운을 3번씩 누르면 조 하나에 120번이다. 엑셀이 편했던 이유가 바로 이 반복을
 * 드래그 한 번으로 끝낸다는 것이라, 같은 동작을 그대로 옮긴다.
 *
 * 덮어쓰기(replace)인 이유: 채우기는 "이 칸을 저 칸처럼 만든다"는 뜻이다. 더하기로 두면
 * 드래그할 때마다 대상 칸에 사람이 쌓여, 지우려면 다시 한 칸씩 눌러야 한다.
 *
 * 호출부가 **미리 슬롯의 기수와 userId 자격을 확인해야 한다**(규칙 #6).
 */
/** 한 칸에 세울 면접관 한 명 — 계정이 있으면 `userId`, 없으면 이름만. */
export type InterviewerRef = { userId: string; name?: never } | { userId?: never; name: string };

export async function setSlotInterviewers(slotIds: string[], people: InterviewerRef[]) {
  if (slotIds.length === 0) return { cleared: 0, added: 0 };

  return db.transaction(async (tx) => {
    // 한 문장이어야 한다 — 지우고 넣는 사이에 실패하면 그 칸들이 통째로 빈 채 남는다.
    const cleared = await tx
      .delete(recruitSlotInterviewers)
      .where(inArray(recruitSlotInterviewers.slotId, slotIds))
      .returning({ id: recruitSlotInterviewers.id });

    if (people.length === 0) return { cleared: cleared.length, added: 0 };

    const rows = slotIds.flatMap((slotId) =>
      people.map((p) => ({
        slotId,
        userId: p.userId ?? null,
        // 계정이 있으면 이름을 베껴 두지 않는다 — 나중에 이름을 고쳤을 때 두 곳이 어긋난다.
        name: p.userId ? null : p.name!.trim(),
      }))
    );
    const added = await tx
      .insert(recruitSlotInterviewers)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: recruitSlotInterviewers.id });
    return { cleared: cleared.length, added: added.length };
  });
}
