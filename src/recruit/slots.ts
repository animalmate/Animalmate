// F9 신입 모집 면접 슬롯 관리 서비스
import { db } from '../db/client';
import { recruitSlots } from '../db/schema';
import { eq, asc } from 'drizzle-orm';

export interface CreateSlotInput {
  cohortId: string;
  panel?: string | null;
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
      panel: input.panel?.trim() || null,
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

/**
 * 조 하나를 통째로 만든다 — 시작~종료 시각을 `durationMin` 간격으로 잘라 슬롯을 한 번에 넣는다.
 *
 * 왜 일괄인가: 조는 하루 종일 유지되는 트랙이라 10:00~18:00 을 30분으로 쪼개면 슬롯이 16개다.
 * 한 칸씩 만들게 하면 회장단이 같은 폼을 16번 채워야 하고, 그 사이 장소를 한 번만 잘못 골라도
 * 그 칸만 다른 방이 된다(지난 기수 엑셀이 조 단위로 한 줄씩 적힌 이유가 이것이다).
 *
 * 시간 계산은 **시작 시각에 분을 더해** 나간다. 로컬 날짜 문자열을 다시 만들지 않으므로
 * 자정을 넘겨도, 서머타임이 없는 KST 에서도 간격이 흔들리지 않는다.
 */
export async function createPanelSlots(input: {
  cohortId: string;
  panel: string;
  startsAt: Date;
  /** 이 시각 **전까지** 만든다(이 시각에 시작하는 슬롯은 만들지 않는다). */
  until: Date;
  durationMin: number;
  link?: string | null;
  venue?: string | null;
  isRemote?: boolean;
  createdBy: string;
}) {
  const step = input.durationMin * 60_000;
  const rows: (typeof recruitSlots.$inferInsert)[] = [];
  for (let t = input.startsAt.getTime(); t < input.until.getTime(); t += step) {
    rows.push({
      cohortId: input.cohortId,
      panel: input.panel.trim(),
      startsAt: new Date(t),
      durationMin: input.durationMin,
      link: input.link ?? null,
      venue: input.venue ?? null,
      isRemote: input.isRemote ?? false,
      createdBy: input.createdBy,
    });
    // 폭주 방지: 잘못된 입력(간격 0 은 위에서 막지만 범위가 며칠이면 수천 개가 된다)이
    // DB 를 채우지 않게 한 조당 상한을 둔다. 하루 24시간 ÷ 10분 = 144 가 현실 최대다.
    if (rows.length >= 200) break;
  }
  if (rows.length === 0) return [];
  return db.insert(recruitSlots).values(rows).returning();
}

export async function listSlotsByCohort(cohortId: string) {
  return db
    .select()
    .from(recruitSlots)
    .where(eq(recruitSlots.cohortId, cohortId))
    // 조를 2차 정렬키로 둔다. 같은 시각 슬롯들의 순서가 정해져 있지 않으면 화면마다 조 순서가
    // 뒤바뀌어 보인다(옛 슬롯의 fallback 번호도 이 순서에 기댄다).
    .orderBy(asc(recruitSlots.startsAt), asc(recruitSlots.panel));
}

export async function deleteSlot(slotId: string) {
  await db.delete(recruitSlots).where(eq(recruitSlots.id, slotId));
}
