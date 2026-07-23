import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { teams } from '@/db/schema';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus, isPrivileged } from '@/auth/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const rows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.isActive, true))
    .orderBy(asc(teams.name));
  // 팀장(비회장단)은 소속 팀만 — 자기 팀만 예약·템플릿을 만들 수 있으므로 드롭다운도 소속 팀만 보인다.
  const scoped = isPrivileged(actor.role) ? rows : rows.filter((r) => actor.teams.some((t) => t.teamId === r.id));
  return NextResponse.json({ teams: scoped });
}
