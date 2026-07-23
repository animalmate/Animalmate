import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 현재 로그인 사용자 정보(권한은 DB 기준으로 재구성).
export async function GET(): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({
    authenticated: true,
    userId: actor.userId,
    role: actor.role,
    membershipActive: actor.membershipActive,
    teams: actor.teams,
  });
}
