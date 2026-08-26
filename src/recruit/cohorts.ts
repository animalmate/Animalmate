// F9 신입 모집 기수(cohorts) 관리 서비스
import { db } from '../db/client';
import { recruitCohorts } from '../db/schema';
import { eq, desc, sql } from 'drizzle-orm';

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

/**
 * **비로그인 공개 화면이 가리킬 기수** — 공고 본문이 채워진 것 중 최신.
 *
 * 왜 "최신 기수"(`listCohorts()[0]`)로는 안 되나: 기수에는 "발행됨" 상태가 없고 `is_closed`
 * 스위치뿐이다. 그래서 회장단이 **다음 기수를 만드는 순간** 공개 공고 페이지가 그 빈 기수로
 * 갈아탔다 — 진행 중이던 모집 공고가 "상세 모집 요강이 준비 중입니다"로 바뀌고, 지원서 화면도
 * 새 기수의 기본 문항으로 바뀌어 지원자가 엉뚱한 기수에 접수됐다. 공격이 아니라 **준비 작업만으로
 * 라이브 모집이 내려가는** 구조였다(보안 QA 2026-08-26, ⑦).
 *
 * 판정 기준을 본문으로 잡은 이유: 공고를 쓰는 것이 곧 "이제 사람들에게 보여도 된다"는 유일한
 * 신호이고, 새 상태 컬럼과 마이그레이션 없이 지금 있는 값으로 판단할 수 있다(사용자 결정).
 * ⚠ 그래서 **포스터만 올리고 본문을 비워 둔 기수는 공개되지 않는다.** 그렇게 운영할 일이 생기면
 *   여기 조건에 `notice_images` 를 더하거나 발행 플래그를 따로 두어야 한다.
 *
 * 마감(`is_closed`)은 거르지 않는다 — 마감된 공고도 "이번 모집은 마감되었어요"를 보여 줘야 하고,
 * 그 화면이 사라지면 지원자는 모집이 있었는지조차 알 수 없다. 실제 접수 차단은
 * `/api/recruit/apply` 가 따로 한다(규칙 #6).
 */
export async function getPublicNoticeCohort() {
  const [found] = await db
    .select()
    .from(recruitCohorts)
    // 공백만 있는 본문은 비어 있는 것으로 본다 — 화면에서도 빈 칸으로 보이므로 발행 신호가 아니다.
    .where(sql`btrim(coalesce(${recruitCohorts.noticeContent}, '')) <> ''`)
    .orderBy(desc(recruitCohorts.createdAt))
    .limit(1);
  return found ?? null;
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


