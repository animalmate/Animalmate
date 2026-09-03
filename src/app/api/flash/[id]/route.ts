// 번개 단건 조회·수정.
//  - 조회(GET): 로그인 전원 + **볼 수 있는 것만**(못 보는 건 404 — 존재 여부도 알려주지 않는다).
//    쪽지는 서비스가 갈라 싣는다: 개최자에게는 신청 건별 대화 전부, 신청자에게는 자기 것만,
//    그 밖에는 아예 안 나간다. 회장단이라도 남의 1:1 대화는 받지 않는다.
//  - 수정(PATCH): 개최자 본인(공동 개최자 포함). 회장단은 override(서비스가 감사 기록).
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { getFlashDetail, updateFlashMeetup, FlashInputError } from '@/flash/flash';
import { PermissionError } from '@/auth/guard';
import { internalError } from '@/http/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const detail = await getFlashDetail(db, actor, id);
  if (!detail) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ flash: detail });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const b = await req.json();
    await updateFlashMeetup(db, actor, id, {
      title: String(b.title ?? ''),
      meetDate: String(b.meetDate ?? ''),
      meetTime: b.meetTime == null ? null : String(b.meetTime),
      place: b.place == null ? null : String(b.place),
      details: b.details == null ? null : String(b.details),
      capacity: b.capacity == null || b.capacity === '' ? null : Number(b.capacity),
      signupOpenAt: b.signupOpenAt == null ? null : String(b.signupOpenAt),
      // `undefined` 면 공동 개최자를 건드리지 않는다(부분 수정). 빈 배열은 "전부 빼라"는 뜻이다.
      coHostIds: Array.isArray(b.coHostIds) ? b.coHostIds.map((v: unknown) => String(v)) : undefined,
    });
    const detail = await getFlashDetail(db, actor, id);
    return NextResponse.json({ flash: detail });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof FlashInputError) return NextResponse.json({ error: 'bad_input', message: e.message }, { status: 400 });
    return internalError('PATCH /api/flash/[id]', e);
  }
}
