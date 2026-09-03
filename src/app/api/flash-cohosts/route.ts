// 공동 개최자 후보 검색(이름 두 글자 이상 → 최대 10명, id·이름만).
//
// 전체 회원 목록을 주는 `/api/admin/members` 와 **일부러 다른 엔드포인트**다. 저쪽은 회장단
// 전용이고 이메일·전화·역할까지 싣는다. 여기는 부원도 써야 하므로(부원이 번개를 열 수 있다)
// 나갈 수 있는 것을 이름 하나로 좁히고, 빈 검색으로 300명 명단이 통째로 내려가지 못하게 막는다.
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { searchCoHostCandidates } from '@/flash/flash';
import { internalError } from '@/http/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const q = (new URL(req.url).searchParams.get('q') ?? '').slice(0, 50);
    return NextResponse.json({ candidates: await searchCoHostCandidates(db, actor, q) });
  } catch (e) {
    return internalError('GET /api/flash-cohosts', e);
  }
}
