// 동아리 전체 가이드북 — 등록(교체) / 삭제. **회장단 전용**.
//
// 조회는 여기가 아니라 `GET /api/guidebooks` 가 팀 목록과 함께 내려준다(화면이 한 장이다).
//
// 팀 가이드북 라우트와 갈라 둔 이유: 이쪽은 **텍스트 추출이 없다**(챗봇이 읽지 않는다).
// Gemini 를 부르지 않으므로 `maxDuration` 을 늘릴 필요도 없고, 검수 단계(PUT contentMd)도 없다.
// 한 라우트에 얹으면 쓰지 않는 분기가 절반이 된다.
//
// 이름을 바꾸는 수단은 두지 않는다 — 칸이 하나뿐이라 이름이 늘 `전체 부원 가이드북` 이다.
//
// 파일 자체는 이 라우트를 지나지 않는다. 브라우저가 Storage 로 직접 올리고(서명 URL),
// 여기에는 경로만 온다 — Vercel 함수의 4.5MB 본문 상한을 피하기 위해서다.
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { GuidebookRejectedError, deleteClubGuidebook, registerClubUpload } from '@/guidebooks/guidebooks';
import { PermissionError } from '@/auth/guard';
import { internalError } from '@/http/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function mapError(scope: string, e: unknown): Response {
  if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (e instanceof GuidebookRejectedError) {
    return NextResponse.json({ error: 'rejected', message: e.message }, { status: 400 });
  }
  return internalError(scope, e);
}

/** 업로드 완료 등록(교체 포함). */
export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const b = await req.json();
    await registerClubUpload(db, actor, {
      path: String(b.path ?? ''),
      fileName: String(b.fileName ?? '가이드북.pdf'),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mapError('POST /api/guidebooks/club', e);
  }
}

export async function DELETE(): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    await deleteClubGuidebook(db, actor);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mapError('DELETE /api/guidebooks/club', e);
  }
}
