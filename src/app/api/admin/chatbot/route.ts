// 챗봇 운영 콘솔 — 사용량 조회 + 설정(활성/일일·분기 상한) 변경. 회장단 전용.
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { isPrivileged } from '@/auth/permissions';
import { getUsage, SETTING_KEYS } from '@/rag/quota';
import { getRecentGaps } from '@/rag/gaps';
import { setSetting } from '@/rag/settings';
import { MAX_FALLBACK_CHARS, VOLUNTEER_FALLBACK_KEY, getVolunteerFallback } from '@/rag/volunteer-fallback';
import { PermissionError } from '@/auth/guard';
import { internalError } from '@/http/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !isPrivileged(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  // 답하지 못한 질문은 사용량과 같은 화면에 둔다 — 챗봇을 보러 들어온 사람에게 필요한 것은
  // "얼마나 썼나"보다 "무엇을 못 답했나"다(메일을 놓쳐도 여기서 보인다).
  const [usage, gaps, volunteerFallback] = await Promise.all([getUsage(db), getRecentGaps(db), getVolunteerFallback(db)]);
  return NextResponse.json({ usage, gaps, volunteerFallback });
}

export async function PATCH(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const b = await req.json();
    if (typeof b.enabled === 'boolean') await setSetting(db, actor, SETTING_KEYS.enabled, b.enabled);
    if (Number.isInteger(b.dailyPerUser) && b.dailyPerUser >= 0) await setSetting(db, actor, SETTING_KEYS.dailyPerUser, b.dailyPerUser);
    if (Number.isInteger(b.globalQuarter) && b.globalQuarter >= 0) await setSetting(db, actor, SETTING_KEYS.globalQuarter, b.globalQuarter);
    // 등록된 봉사 회차가 없을 때 챗봇이 내보내는 기본 안내. 빈 문자열로 저장하면 코드 기본값으로 돌아간다.
    if (typeof b.volunteerFallback === 'string') {
      await setSetting(db, actor, VOLUNTEER_FALLBACK_KEY, b.volunteerFallback.trim().slice(0, MAX_FALLBACK_CHARS));
    }
    return NextResponse.json({ usage: await getUsage(db), volunteerFallback: await getVolunteerFallback(db) });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    return internalError('PATCH /api/admin/chatbot', e);
  }
}
