import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { setTeamActive, setTeamNoticeEditing, deleteTeam, TeamInUseError } from '@/org/teams';
import { setTeamManualLeaders, TeamMemberError } from '@/org/team-members';
import { PermissionError } from '@/auth/guard';
import { internalError } from '@/http/errors';
import { InputTooLongError } from '@/http/input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 활성/비활성 토글, 모집 공고 편집 권한 토글, 또는 미가입자 수동 팀장단 갱신.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const b = await req.json();
    if (Array.isArray(b.leaders)) {
      const team = await setTeamManualLeaders(db, actor, id, b.leaders);
      return NextResponse.json({ team });
    }
    // isActive 보다 **먼저** 본다. 마지막 분기가 `Boolean(b.isActive)` 라, 공고 권한만 보낸
    // 요청이 여기까지 흘러가면 isActive 가 undefined→false 로 읽혀 팀이 조용히 비활성화된다.
    if (typeof b.canEditNotice === 'boolean') {
      const team = await setTeamNoticeEditing(db, actor, id, b.canEditNotice);
      return NextResponse.json({ team });
    }
    const team = await setTeamActive(db, actor, id, Boolean(b.isActive));
    return NextResponse.json({ team });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof TeamMemberError) return NextResponse.json({ error: e.code, email: e.email }, { status: 400 });
    if (e instanceof InputTooLongError) return NextResponse.json({ error: 'too_long', field: e.field, max: e.max }, { status: 400 });
    return internalError('PATCH /api/admin/teams/[id]', e);
  }
}

// 하드 삭제(참조 없을 때만).
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await deleteTeam(db, actor, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof TeamInUseError) return NextResponse.json({ error: 'team_in_use', counts: e.counts }, { status: 409 });
    return internalError('DELETE /api/admin/teams/[id]', e);
  }
}
