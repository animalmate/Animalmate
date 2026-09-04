// 개최자가 명단에 사람을 미리 넣는다(사전 배정).
//
// `[id]/signup` 과 갈라 둔 이유: 저쪽은 **부원이 자기 자리를 얻는** 길이라 신청 창·레이트리밋이
// 걸려 있고, 여기는 **개최자가 자리를 잡아 두는** 관리 행위라 둘 다 걸리면 안 된다(신청 시작
// 시각 전에 넣는 것이 이 기능의 목적이다). 한 라우트에 합치면 그 차이가 body 값 하나에 숨는다.
//
// 레이트리밋을 걸지 않는 것도 같은 이유다 — 개최자 권한을 이미 확인했고, 다른 관리 엔드포인트
// (`[id]/action`)와 결을 맞춘다. 인원 상한은 서비스의 `PLACE_MAX` 가 잡는다.
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { placeFlashSignups, FlashInputError } from '@/flash/flash';
import { PermissionError } from '@/auth/guard';
import { internalError } from '@/http/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const b = await req.json();
    const userIds = Array.isArray(b.userIds) ? b.userIds.map((v: unknown) => String(v)) : [];
    // 확정인지 대기인지를 돌려준다 — 정원이 이미 찼으면 넣어진 사람이 대기 줄로 가는데,
    // 그 사실을 화면이 곧바로 말해 주지 않으면 개최자는 자리를 잡았다고 믿는다.
    return NextResponse.json({ placed: await placeFlashSignups(db, actor, id, userIds) });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof FlashInputError) return NextResponse.json({ error: 'bad_input', message: e.message }, { status: 400 });
    return internalError('POST /api/flash/[id]/place', e);
  }
}
