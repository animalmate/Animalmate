import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { isPrivileged } from '@/auth/permissions';
import { listMembers } from '@/auth/members';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 회원 목록 — 회장단·시스템관리자 전용.
export async function GET(): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !isPrivileged(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ members: await listMembers(db) });
}
