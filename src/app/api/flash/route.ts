// 번개 목록·개최.
//  - 조회(GET): **로그인한 전원**(부원 포함). 보이는 범위는 서비스의 `visibleFlash` 가 SQL WHERE 로
//    가른다 — 부원 응답에는 승인 대기·거절 건이 행 자체로 들어오지 않는다. 역할 검사를 여기 또
//    두면 그 필터가 진짜 방어선이라는 사실이 흐려진다(일정 라우트와 같은 판단).
//  - 개최(POST): 부원 이상 전원. **부원이 낸 것은 승인 대기(pending)** 로 들어가고, 운영진 이상은
//    곧바로 모집 중(open)이다. 그 갈림은 서비스의 `initialFlashStatus` 가 정한다.
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { listFlashMeetups, createFlashMeetup, countPendingFlash, FlashInputError } from '@/flash/flash';
import { PermissionError } from '@/auth/guard';
import { internalError } from '@/http/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const scope = new URL(req.url).searchParams.get('scope') === 'past' ? 'past' : 'upcoming';
  const [items, pending] = await Promise.all([
    listFlashMeetups(db, actor, { scope }),
    countPendingFlash(db, actor), // 운영진이 아니면 0 이다(서비스가 판단)
  ]);
  return NextResponse.json({ flash: items, pendingCount: pending });
}

export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const b = await req.json();
    const row = await createFlashMeetup(db, actor, {
      title: String(b.title ?? ''),
      meetDate: String(b.meetDate ?? ''),
      meetTime: b.meetTime == null ? null : String(b.meetTime),
      place: b.place == null ? null : String(b.place),
      details: b.details == null ? null : String(b.details),
      capacity: b.capacity == null || b.capacity === '' ? null : Number(b.capacity),
      signupOpenAt: b.signupOpenAt == null ? null : String(b.signupOpenAt),
      coHostIds: Array.isArray(b.coHostIds) ? b.coHostIds.map((v: unknown) => String(v)) : [],
    });
    // 부원에게는 "승인 대기" 라는 사실이 결과의 전부다 — 화면이 그 문구를 그리려면 상태가 필요하다.
    return NextResponse.json({ id: row.id, status: row.status });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof FlashInputError) return NextResponse.json({ error: 'bad_input', message: e.message }, { status: 400 });
    return internalError('POST /api/flash', e);
  }
}
