import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { users, memberships } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus } from '@/auth/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // 활성 임기의 운영진(staff, board, sysadmin) 목록 조회.
  // 이메일은 싣지 않는다 — 부르는 화면 세 곳(면접 배정·면접 콘솔·서류 심사) 모두 이름만 쓰는데,
  // 실으면 운영진 30여 명의 주소록이 모집 화면을 여는 모든 운영진 브라우저로 나간다(최소 노출).
  const staffList = await db
    .select({
      id: users.id,
      name: users.name,
      role: memberships.role,
    })
    .from(users)
    .innerJoin(memberships, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.status, 'active'),
        inArray(memberships.role, ['staff', 'board', 'sysadmin'])
      )
    );

  return NextResponse.json({ staff: staffList });
}
