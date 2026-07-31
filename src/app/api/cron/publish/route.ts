// pg_cron(매분) → pg_net 이 CRON_SECRET 헤더로 호출하는 발행 워커 엔드포인트.
// Vercel Cron 사용 금지(00 규칙 #7). Authorization: Bearer <CRON_SECRET> 없으면 401.

import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/http/cron-auth';
import { runPublishWorker } from '@/publishing/publish-worker';
import { db } from '@/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // 캐시 금지(매 호출 실행)

/**
 * 이 워커는 **대기 시간이 본질인** 함수다 — code 999(연속 등록 불가)를 피하려고 건별 30초를 쉰다.
 * 한 사이클 최대 5건이면 대기만 4×30초 = 120초라, 일반 라우트와 달리 긴 예산이 반드시 필요하다.
 *
 * 값을 명시하는 이유: 예산을 플랫폼 기본값에 맡겨 두면 **조용히** 바뀔 수 있고, 그때 증상은
 * 사이클이 도중에 끊겨 2건째부터 임차 만료(10분) 뒤에야 나가는 지연이다 — 알아채기 어렵다.
 * 여기 적어 두면 예산이 모자랄 때 배포가 먼저 실패해서 눈에 띈다.
 * (2026-07-31 확인: 이 프로젝트는 Fluid compute 활성 + Max Duration 300초.)
 */
export const maxDuration = 300;

export async function POST(req: Request): Promise<Response> {
  if (!isAuthorizedCron(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const summary = await runPublishWorker(db);
    return NextResponse.json(summary);
  } catch (e) {
    // 실패해도 크론이 다음 사이클에 재시도. 요약은 워커가 audit 에 남긴다.
    // 이 라우트는 CRON_SECRET 을 아는 호출자에게만 열려 있고 응답은 pg_net 로그로만 간다 —
    // 그래서 사용자 대면 라우트와 달리 원인 메시지를 그대로 실어 보낸다(관제 디버깅 채널).
    return NextResponse.json(
      { error: 'worker_failed', message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
