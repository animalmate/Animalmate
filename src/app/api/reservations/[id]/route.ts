import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus, isPrivileged, ownsResource } from '@/auth/permissions';
import { getReservation, updateReservation } from '@/publishing/reservations';
import { loadPublishVars } from '@/publishing/final-render';
import { PermissionError } from '@/auth/guard';
import { internalError } from '@/http/errors';
import { LIMITS, InputTooLongError, checkLength, parseDate } from '@/http/input';

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
    const title = b.title !== undefined ? String(b.title) : undefined;
    const contentMd = b.contentMd !== undefined ? String(b.contentMd) : undefined;
    const place = b.place !== undefined ? (b.place === null ? null : String(b.place)) : undefined;
    checkLength('제목', title, LIMITS.title);
    checkLength('본문', contentMd, LIMITS.contentMd);
    checkLength('장소', place, LIMITS.place);
    await updateReservation(db, actor, id, {
      title,
      contentMd,
      publishAt: b.publishAt !== undefined ? parseDate(b.publishAt) : undefined,
      eventDate: b.eventDate,
      meetTime: b.meetTime,
      place,
      capacity: b.capacity !== undefined && b.capacity !== '' ? Number(b.capacity) : b.capacity === '' ? null : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof InputTooLongError) return NextResponse.json({ error: 'too_long', field: e.field, max: e.max }, { status: 400 });
    return internalError('PATCH /api/reservations/[id]', e);
  }
}
