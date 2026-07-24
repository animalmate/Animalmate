import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { isPrivileged } from '@/auth/permissions';
import { setMemberRole, setMemberActive, revokeSessions, MemberError } from '@/auth/members';
import { setUserTeams, TeamMemberError } from '@/org/team-members';
import { PermissionError } from '@/auth/guard';
import { internalError } from '@/http/errors';
import { InputTooLongError } from '@/http/input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 회원 역할 지정 / 활성 토글 — 회장단·시스템관리자 전용(서비스에서 에스컬레이션 방지 재검증).
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !isPrivileged(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  try {
    const b = await req.json();
    if (typeof b.role === 'string') {
      await setMemberRole(db, actor, id, b.role);
      return NextResponse.json({ ok: true });
    }
    if (typeof b.active === 'boolean') {
      await setMemberActive(db, actor, id, b.active);
      return NextResponse.json({ ok: true });
    }
    // 팀 배정(팀+직위+직함) 갱신.
    if (Array.isArray(b.teams)) {
      await setUserTeams(db, actor, id, b.teams);
      return NextResponse.json({ ok: true });
    }
    // 모든 기기에서 로그아웃(users.session_version + 1 → 기존 토큰 전부 무효).
    if (b.revokeSessions === true) {
      await revokeSessions(db, actor, id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof MemberError) return NextResponse.json({ error: e.code }, { status: 400 });
    if (e instanceof TeamMemberError) return NextResponse.json({ error: e.code }, { status: 400 });
    if (e instanceof InputTooLongError) return NextResponse.json({ error: 'too_long', field: e.field, max: e.max }, { status: 400 });
    return internalError('PATCH /api/admin/members/[id]', e);
  }
}
