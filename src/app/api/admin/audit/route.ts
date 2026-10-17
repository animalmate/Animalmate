// 감사 기록 조회 — **회장단·시스템관리자 전용, 읽기 전용.**
//
// 기록에는 이전값→새값이 그대로 들어 있어 회원 이름 같은 값이 섞일 수 있다. 그래서 이 라우트는
// 회원 관리 화면과 같은 층(회장단)에서만 열린다. UI 숨김은 권한이 아니다(규칙 #6) — 여기서 막는다.
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { isPrivileged } from '@/auth/permissions';
import { listAuditActors, listAuditLogs, DEFAULT_LIMIT } from '@/auth/audit-query';
import { AUDIT_GROUPS } from '@/auth/audit-view';
import { internalError } from '@/http/errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GROUP_KEYS = new Set(AUDIT_GROUPS.map((g) => g.key));

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

    // 필터 값은 화면이 고르는 목록 안에서만 받는다. 분류는 LIKE 접두사로 쓰이므로 `%`·`_` 가 섞이면
    // 조건이 무력해지고, 행위자는 uuid 칸이라 모양이 틀리면 DB 오류(500)가 났다(2026-10-17 보안 감사).
    const group = url.searchParams.get('group') || undefined;
    const actorParam = url.searchParams.get('actor') || undefined;
    if ((group && !GROUP_KEYS.has(group)) || (actorParam && !UUID_RE.test(actorParam))) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    const page = await listAuditLogs(db, {
      group,
      highOnly: url.searchParams.get('high') === '1',
      includeAutomated: url.searchParams.get('auto') === '1',
      days: num('days'),
      actorUserId: actorParam,
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
