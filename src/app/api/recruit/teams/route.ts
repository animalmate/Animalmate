import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { teams } from '@/db/schema';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus } from '@/auth/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 신입 모집 화면의 팀 선택 목록.
 *
 * `/api/teams` 를 쓰지 않는 이유:
 *  - 그쪽은 비회장단에게 "본인 소속 팀"만 돌려준다(예약·템플릿 소유권 때문). 모집에서는
 *    운영진이 남의 팀 지망자도 채점·필터링해야 하므로 전체 팀이 필요하다.
 *  - 그쪽은 팀마다 {{팀장단}} 명단을 계산해 붙인다 — 드롭다운에는 불필요한 비용이다.
 *
 * 목록의 출처는 teams 테이블이다. 즉 회장단이 "회원 관리" 화면에서 팀을 추가·수정·비활성화하면
 * 모집 화면 드롭다운도 자동으로 따라간다(예전에는 각 패널에 "봉사 1팀" 같은 옛 이름이
 * 하드코딩돼 있어 실제 팀과 어긋나 있었다).
 */
export async function GET(): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const rows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.isActive, true))
    .orderBy(asc(teams.name));

  return NextResponse.json({ teams: rows });
}
