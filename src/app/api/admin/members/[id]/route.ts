import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { getCurrentActor } from '@/auth/current-user';
import { isPrivileged } from '@/auth/permissions';
import { setMemberRole, setMemberActive, revokeSessions, withdrawMember, MemberError } from '@/auth/members';
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

/**
 * 강제 탈퇴 — 되돌릴 수 없다(비활성화와 달리 개인정보가 실제로 지워진다).
 * 회장단이 실수로 누르는 일을 막기 위해 **대상 이름을 정확히 다시 입력**해야 진행한다.
 * 기수 삭제(`?confirmLabel=`)와 같은 방식이다.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !isPrivileged(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  try {
    const confirmName = new URL(req.url).searchParams.get('confirmName');
    const [target] = await db.select({ name: users.name }).from(users).where(eq(users.id, id)).limit(1);
    if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (!confirmName || confirmName.trim() !== target.name.trim()) {
      return NextResponse.json(
        { error: 'confirm_required', message: '대상 회원의 이름을 정확히 입력해야 탈퇴 처리됩니다.' },
        { status: 400 }
      );
    }
    await withdrawMember(db, actor, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof MemberError) return NextResponse.json({ error: e.code }, { status: 400 });
    return internalError('DELETE /api/admin/members/[id]', e);
  }
}
