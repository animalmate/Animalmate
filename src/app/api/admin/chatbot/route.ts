// 챗봇 운영 콘솔 — 사용량 조회 + 설정(활성/일일·분기 상한) 변경. 회장단 전용.
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { isPrivileged } from '@/auth/permissions';
import { getUsage, SETTING_KEYS } from '@/rag/quota';
import { setSetting } from '@/rag/settings';
import { PermissionError } from '@/auth/guard';
import { internalError } from '@/http/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !isPrivileged(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ usage: await getUsage(db) });
}

export async function PATCH(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const b = await req.json();
    if (typeof b.enabled === 'boolean') await setSetting(db, actor, SETTING_KEYS.enabled, b.enabled);
    if (Number.isInteger(b.dailyPerUser) && b.dailyPerUser >= 0) await setSetting(db, actor, SETTING_KEYS.dailyPerUser, b.dailyPerUser);
    if (Number.isInteger(b.globalQuarter) && b.globalQuarter >= 0) await setSetting(db, actor, SETTING_KEYS.globalQuarter, b.globalQuarter);
    return NextResponse.json({ usage: await getUsage(db) });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    return internalError('PATCH /api/admin/chatbot', e);
  }
}
