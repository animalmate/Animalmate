// 공개 범위(visibility) — 문서(documents)와 일정(schedules)이 함께 쓰는 **단 하나의** 등급 정의.
//
// 왜 여기에 있나: 이 등급은 챗봇이 무엇을 검색할 수 있는지를 가르는 **보안 필터**다(규칙 #3).
// 문서에 하나, 일정에 하나씩 두면 언젠가 한쪽만 고쳐진다 — 그때 새는 것은 상위 등급 자료다.
// 대상이 늘어나도 정의는 이 파일 하나만 본다.
//
// 규칙: 질문자 역할 **이하** 등급만 볼 수 있다. member(0) < staff(1) < board(2)=sysadmin.

import type { visibilityEnum } from '@/db/schema';
import type { Actor, Role } from './permissions';

export type Visibility = (typeof visibilityEnum.enumValues)[number]; // member | staff | board

export const VISIBILITY_RANK: Record<Visibility, number> = { member: 0, staff: 1, board: 2 };

/** 역할 → 볼 수 있는 최고 등급. board·sysadmin 은 전부 본다. */
export function roleVisibilityRank(role: Role): number {
  return role === 'member' ? 0 : role === 'staff' ? 1 : 2;
}

/**
 * 이 사람이 볼 수 있는 visibility 값 목록.
 *
 * 쓰는 쪽은 이 목록을 **SQL WHERE(inArray)** 에 넣어야 한다. 조회한 뒤 코드로 걸러내면
 * (post-filter) 실수 한 번에 상위 등급이 새어 나간다 — 애초에 결과에 들어오지 않게 한다.
 */
export function allowedVisibilities(actor: Actor): Visibility[] {
  const rank = roleVisibilityRank(actor.role);
  return (Object.keys(VISIBILITY_RANK) as Visibility[]).filter((v) => VISIBILITY_RANK[v] <= rank);
}
