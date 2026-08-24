// 가이드북 업로드용 **서명 URL 발급**. 파일은 이 라우트를 지나지 않는다.
//
// 왜 이렇게 하나: Vercel 서버리스 함수의 요청 본문 상한이 4.5MB 라, 가이드북 PDF 를 API Route 로
// 받으면 우리 코드에 닿기도 전에 413 으로 끊긴다. 그래서 서버는 "이 경로에만 쓸 수 있는" 서명
// URL 을 내주고, 브라우저가 Supabase Storage 로 직접 보낸다. 서비스 키는 서버에만 남는다.
//
// 경로는 **서버가 정한다**(요청 본문의 경로를 받지 않는다). 그래야 남의 팀 자리에 못 쓴다.
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { GuidebookRejectedError, createUploadTicket } from '@/guidebooks/guidebooks';
import { PermissionError } from '@/auth/guard';
import { internalError } from '@/http/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const b = await req.json();
    const ticket = await createUploadTicket(db, actor, {
      teamId: String(b.teamId ?? ''),
      contentType: String(b.contentType ?? ''),
      fileBytes: Number(b.fileBytes ?? 0),
    });
    return NextResponse.json(ticket);
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof GuidebookRejectedError) {
      return NextResponse.json({ error: 'rejected', message: e.message }, { status: 400 });
    }
    return internalError('POST /api/guidebooks/upload-url', e);
  }
}
