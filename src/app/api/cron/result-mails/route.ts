// pg_cron(5분마다) → pg_net 이 CRON_SECRET 헤더로 호출하는 결과 안내 메일 발송 워커.
// Vercel Cron 사용 금지(00 규칙 #7). Authorization: Bearer <CRON_SECRET> 없으면 401.

import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/http/cron-auth';
import { runResultMailWorker } from '@/recruit/result-mails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 한 사이클에 최대 25통(BATCH_PER_TICK)을 **한 통씩 순차로** 보낸다. Gmail SMTP 왕복이
 * 건당 1초 안팎이라 25초쯤 걸리고, 느린 날에는 그보다 늘어난다. 기본 예산에 맡기면 사이클이
 * 도중에 끊기는데, 그때 증상은 "일부만 나가고 나머지는 다음 사이클" 이라 조용히 지연될 뿐
 * 눈에 띄지 않는다(발행 워커 주석과 같은 이유). 여기 적어 두면 모자랄 때 배포가 먼저 실패한다.
 */
export const maxDuration = 300;

export async function POST(req: Request): Promise<Response> {
  if (!isAuthorizedCron(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const summary = await runResultMailWorker();
    return NextResponse.json(summary);
  } catch (e) {
    // 실패해도 다음 사이클에 재시도한다(대기열은 DB 에 남아 있다).
    // 응답은 CRON_SECRET 을 아는 호출자에게만 가므로 원인을 그대로 실어 보낸다(관제 채널).
    return NextResponse.json(
      { error: 'worker_failed', message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
