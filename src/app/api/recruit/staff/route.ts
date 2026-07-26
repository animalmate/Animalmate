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

  // 활성 임기의 운영진(staff, board, sysadmin) 목록 조회
  const staffList = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
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
