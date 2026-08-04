// 동아리 일정 단건 조회·수정·삭제.
//  - 조회(GET): **로그인한 전원** + 볼 수 있는 등급만(못 보는 등급은 404 — 존재 여부도 알려주지 않는다).
//  - 수정·삭제: 회장단·시스템관리자만(서비스가 검증).
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { getSchedule, updateSchedule, deleteSchedule, ScheduleInputError } from '@/schedules/schedules';
import { toScheduleView } from '@/schedules/view';
import { PermissionError } from '@/auth/guard';
import { internalError } from '@/http/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const row = await getSchedule(db, actor, id);
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ schedule: toScheduleView(row) });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const b = await req.json();
    const row = await updateSchedule(db, actor, id, {
      title: String(b.title ?? ''),
      startDate: String(b.startDate ?? ''),
      endDate: b.endDate == null ? null : String(b.endDate),
      startTime: b.startTime == null ? null : String(b.startTime),
      place: b.place == null ? null : String(b.place),
      details: b.details == null ? null : String(b.details),
      visibility: b.visibility,
    });
    return NextResponse.json({ schedule: toScheduleView(row) });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof ScheduleInputError) return NextResponse.json({ error: 'bad_input', message: e.message }, { status: 400 });
    return internalError('PATCH /api/schedules/[id]', e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await deleteSchedule(db, actor, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    return internalError('DELETE /api/schedules/[id]', e);
  }
}
