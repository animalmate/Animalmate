import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus, isPrivileged, ownsResource } from '@/auth/permissions';
import { getReservation, updateReservation } from '@/publishing/reservations';
import { loadPublishVars } from '@/publishing/final-render';
import { PermissionError } from '@/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const detail = await getReservation(db, id);
  if (!detail) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  // 비회장단은 소유(본인/소속 팀) 예약만 열람(자기 팀만 관리 원칙).
  if (!isPrivileged(actor.role) && !ownsResource(actor, { ownerType: detail.post.ownerType, ownerId: detail.post.ownerId })) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  // 수정 화면 미리보기용 치환 변수(팀장단 명단 등). 장소·정원은 폼의 현재 입력값으로 클라이언트가 덮어쓴다.
  const vars = await loadPublishVars(db, detail.post);
  return NextResponse.json({ ...detail, vars });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const b = await req.json();
    await updateReservation(db, actor, id, {
      title: b.title,
      contentMd: b.contentMd,
      publishAt: b.publishAt !== undefined ? (b.publishAt ? new Date(b.publishAt) : null) : undefined,
      eventDate: b.eventDate,
      meetTime: b.meetTime,
      place: b.place,
      capacity: b.capacity !== undefined && b.capacity !== '' ? Number(b.capacity) : b.capacity === '' ? null : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'internal', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
