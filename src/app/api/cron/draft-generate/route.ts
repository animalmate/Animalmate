// pg_cron(매일) → pg_net 이 CRON_SECRET 헤더로 호출하는 회차 초안 생성 엔드포인트.
// D-(draft_lead_days) 인 반복 규칙의 events 초안을 생성한다. Vercel Cron 금지(규칙 #7).

import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/http/cron-auth';
import { generateDueDrafts } from '@/recurrence/draft-generation';
import { db } from '@/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  if (!isAuthorizedCron(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const summary = await generateDueDrafts(db);
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json(
      { error: 'draft_generate_failed', message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
