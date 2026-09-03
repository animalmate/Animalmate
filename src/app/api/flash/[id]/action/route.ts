// 번개 상태 전이 한 곳 — 승인·거절(운영진), 마감·재개·취소(개최자), 읽음 표시(본인).
//
// 라우트를 행위마다 쪼개지 않은 이유: 전부 "번개 한 건의 상태를 한 칸 옮긴다"는 같은 일이고,
// 나눠 두면 어느 행위가 어떤 권한을 쓰는지 파일 다섯 개를 열어야 알 수 있다. 판단 자체는
// 서비스가 하고(여기서 역할을 다시 묻지 않는다), 이 파일은 이름을 서비스 함수로 옮기기만 한다.
//
// `read` 만 성격이 다르다 — 상태 전이가 아니라 배지를 끄는 표시이고, 자기 자신에 대한 것이라
// 권한 판단이 없다(내 읽음 시각을 내가 찍는다).
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { decideFlashMeetup, setFlashState, markFlashRead, FlashInputError } from '@/flash/flash';
import { PermissionError } from '@/auth/guard';
import { internalError } from '@/http/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOTE_MAX = 500;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const b = await req.json();
    const action = String(b.action ?? '');
    const note = b.note == null ? null : String(b.note).slice(0, NOTE_MAX);

    if (action === 'read') {
      await markFlashRead(db, actor, id);
      return NextResponse.json({ ok: true });
    }
    if (action === 'approve' || action === 'reject') {
      const row = await decideFlashMeetup(db, actor, id, action, note);
      return NextResponse.json({ status: row.status });
    }
    if (action === 'close' || action === 'reopen' || action === 'cancel') {
      const row = await setFlashState(db, actor, id, action, note);
      return NextResponse.json({ status: row.status });
    }
    return NextResponse.json({ error: 'bad_input', message: '알 수 없는 동작이에요.' }, { status: 400 });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof FlashInputError) return NextResponse.json({ error: 'bad_input', message: e.message }, { status: 400 });
    return internalError('POST /api/flash/[id]/action', e);
  }
}
