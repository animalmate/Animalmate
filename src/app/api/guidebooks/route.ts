// 팀 가이드북 — 목록 조회 / 업로드 등록 / 확인 반영 / 삭제.
//
//  - 조회(GET): **로그인한 전원**(부원 포함). 가이드북은 부원에게 보여 주려고 만드는 자료다.
//    편집 권한은 응답의 `canManage` 로 내려가고, 검수 전 본문은 권한 없는 사람에게 **아예 실리지 않는다**
//    (서비스가 거른다 — 화면에서 숨기는 것은 방어가 아니다, 규칙 #6).
//  - 쓰기(POST/PUT/DELETE): 그 팀의 팀장단 + 회장단. 판단은 전부 서비스의 requireAuthorized 가 한다.
//
// 파일 자체는 이 라우트를 지나지 않는다. 브라우저가 Storage 로 직접 올리고(서명 URL),
// 여기에는 경로만 온다 — Vercel 함수의 4.5MB 본문 상한을 피하기 위해서다.
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import {
  GuidebookRejectedError,
  confirmGuidebookText,
  deleteTeamGuidebook,
  getClubGuidebook,
  listGuidebooks,
  registerUpload,
} from '@/guidebooks/guidebooks';
import { isPrivileged } from '@/auth/permissions';
import { PiiBlockedError } from '@/rag/documents';
import { PermissionError } from '@/auth/guard';
import { internalError } from '@/http/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// PDF 를 내려받아 Gemini 로 읽히는 동안 기본 10초로는 모자란다(20MB 짜리는 수십 초).
// Hobby 플랜 상한이 60초다.
export const maxDuration = 60;

/** 서비스가 던지는 도메인 오류 → 상태코드. 그 밖의 예외는 내부 오류로 감춘다. */
function mapError(scope: string, e: unknown): Response {
  if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (e instanceof GuidebookRejectedError) return NextResponse.json({ error: 'rejected', message: e.message }, { status: 400 });
  if (e instanceof PiiBlockedError) {
    return NextResponse.json({ error: 'pii_blocked', message: e.message, findings: e.findings }, { status: 422 });
  }
  return internalError(scope, e);
}

export async function GET(): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    // 전체 가이드북과 팀 가이드북을 한 번에 준다 — 화면이 한 장이므로 왕복을 둘로 쪼갤 이유가 없다.
    // `canManageClub` 은 표시용 판정이고, 실제 검증은 쓰기 라우트가 다시 한다(규칙 #6).
    const [teamRows, club] = await Promise.all([listGuidebooks(db, actor), getClubGuidebook(db)]);
    return NextResponse.json({ teams: teamRows, club, canManageClub: isPrivileged(actor.role) });
  } catch (e) {
    return internalError('GET /api/guidebooks', e);
  }
}

/** 업로드 완료 등록 + 텍스트 추출. 응답의 pendingText 를 화면이 검수 상자에 띄운다. */
export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const b = await req.json();
    const out = await registerUpload(db, actor, {
      teamId: String(b.teamId ?? ''),
      path: String(b.path ?? ''),
      fileName: String(b.fileName ?? '가이드북.pdf'),
    });
    return NextResponse.json({
      status: out.guidebook.status,
      pendingText: out.pendingText,
      failReason: out.failReason,
    });
  } catch (e) {
    return mapError('POST /api/guidebooks', e);
  }
}

/** 검수한 본문을 챗봇 지식베이스에 반영한다. 여기서야 doc_chunks 가 생긴다. */
export async function PUT(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const b = await req.json();
    const row = await confirmGuidebookText(db, actor, {
      teamId: String(b.teamId ?? ''),
      contentMd: String(b.contentMd ?? ''),
      piiAck: b.piiAck === true,
    });
    return NextResponse.json({ status: row.status });
  } catch (e) {
    return mapError('PUT /api/guidebooks', e);
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const teamId = new URL(req.url).searchParams.get('teamId') ?? '';
    await deleteTeamGuidebook(db, actor, teamId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mapError('DELETE /api/guidebooks', e);
  }
}
