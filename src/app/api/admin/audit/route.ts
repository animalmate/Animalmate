// 감사 기록 조회 — **회장단·시스템관리자 전용, 읽기 전용.**
//
// 기록에는 이전값→새값이 그대로 들어 있어 회원 이름 같은 값이 섞일 수 있다. 그래서 이 라우트는
// 회원 관리 화면과 같은 층(회장단)에서만 열린다. UI 숨김은 권한이 아니다(규칙 #6) — 여기서 막는다.
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { isPrivileged } from '@/auth/permissions';
import { listAuditActors, listAuditLogs, DEFAULT_LIMIT } from '@/auth/audit-query';
import { internalError } from '@/http/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !isPrivileged(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    const url = new URL(req.url);
    const num = (name: string) => {
      const v = Number(url.searchParams.get(name));
      return Number.isFinite(v) && v > 0 ? v : undefined;
    };

    const page = await listAuditLogs(db, {
      group: url.searchParams.get('group') || undefined,
      highOnly: url.searchParams.get('high') === '1',
      includeAutomated: url.searchParams.get('auto') === '1',
      days: num('days'),
      actorUserId: url.searchParams.get('actor') || undefined,
      cursor: url.searchParams.get('cursor'),
      limit: num('limit') ?? DEFAULT_LIMIT,
    });

    // 행위자 목록은 첫 페이지에서만 함께 보낸다 — 이어보기마다 다시 셀 이유가 없다.
    const actors = url.searchParams.get('cursor') ? undefined : await listAuditActors(db);
    return NextResponse.json({ ...page, actors });
  } catch (e) {
    return internalError('GET /api/admin/audit', e);
  }
}
