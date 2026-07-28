// pg_cron(매일) → **일일 유지보수** 엔드포인트. 경로명 `draft-generate` 는 옛 회차 자동 생성에서
// 온 것으로 지금 하는 일과 다르다. pg_cron 잡을 다시 등록하지 않으려고 이름만 유지한다.
//
// 지금 하는 일 3가지:
//   1. 발행 D-3/D-1 미완성 점검 + 팀장단 알림
//   2. 임기(term_end) 지난 멤버십 강등 + 세션 무효화  ← 필수원칙 #2
//   3. 지난 레이트 리밋 카운터 정리
//
// Vercel Cron 금지(규칙 #7).

import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/http/cron-auth';
import { runReadinessCheck } from '@/publishing/readiness-check';
import { expireLapsedMemberships } from '@/auth/term-expiry';
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
    const readiness = await runReadinessCheck(db, { mailer: defaultMailer() });
    // 임기 만료는 미완성 점검과 독립이다 — 한쪽이 실패해도 다른 쪽은 돌아야 하므로 순서만 나눠 둔다.
    // (여기서 throw 되면 아래 정리까지 못 하지만, 다음 사이클이 하루 뒤에 다시 시도한다.)
    const termExpiry = await expireLapsedMemberships(db);
    await pruneRateLimits(db); // 지난 윈도의 레이트 리밋 카운터 정리(테이블이 무한히 자라지 않게)
    return NextResponse.json({ readiness, termExpiry });
  } catch (e) {
    // CRON_SECRET 뒤에 있고 응답은 pg_net 로그로만 간다 — 관제 디버깅용으로 원인을 그대로 싣는다
    // (사용자 대면 라우트는 internalError 로 고정 문구만 내보낸다).
    return NextResponse.json(
      { error: 'readiness_check_failed', message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
