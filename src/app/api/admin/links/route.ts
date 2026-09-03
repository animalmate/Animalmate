import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { isPrivileged } from '@/auth/permissions';
import { getHomeLinks, setHomeLinks, InvalidLinkError, type LinkKey } from '@/org/links';
import { PermissionError } from '@/auth/guard';
import { internalError } from '@/http/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 홈 바로가기 링크 설정 — 회장단 전용(서비스의 setSetting 이 권한·audit 을 다시 검증한다).

export async function GET(): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isPrivileged(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json(await getHomeLinks(db));
}

export async function PATCH(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isPrivileged(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try {
    const body = (await req.json()) as Partial<Record<LinkKey, unknown>>;
    // 보낸 칸만 손댄다 — 화면이 세 칸을 함께 보내지만, 한 칸만 보내는 호출도 그대로 동작한다.
    const patch: Partial<Record<LinkKey, string>> = {};
    for (const key of ['driveUrl', 'suggestUrl', 'reportUrl'] as LinkKey[]) {
      if (body[key] !== undefined) patch[key] = String(body[key] ?? '');
    }
    const saved = await setHomeLinks(db, actor, patch);
    return NextResponse.json({ ok: true, ...saved });
  } catch (e) {
    // 거부 사유는 그대로 보여 준다 — 사용자가 고칠 수 있는 입력 오류다.
    if (e instanceof InvalidLinkError) return NextResponse.json({ error: 'invalid_link', message: e.message }, { status: 400 });
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    return internalError('PATCH /api/admin/links', e);
  }
}
