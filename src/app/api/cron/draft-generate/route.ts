// pg_cron(매일) → 발행 D-3/D-1 미완성 점검 엔드포인트. (구 회차 자동 생성에서 전환.)
// 경로명은 pg_cron 잡 호환을 위해 유지. Vercel Cron 금지(규칙 #7).

import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/http/cron-auth';
import { runReadinessCheck } from '@/publishing/readiness-check';
import { defaultMailer } from '@/auth/mailer';
import { pruneRateLimits } from '@/http/rate-limit';
import { db } from '@/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  if (!isAuthorizedCron(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const summary = await runReadinessCheck(db, { mailer: defaultMailer() });
    await pruneRateLimits(db); // 지난 윈도의 레이트 리밋 카운터 정리(테이블이 무한히 자라지 않게)
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json(
      { error: 'readiness_check_failed', message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
