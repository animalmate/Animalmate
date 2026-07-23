// 헬스체크 — Supabase 무료 티어 7일 미사용 일시정지 방지 + 가동 감시(UptimeRobot 5분).
// 비인증 허용(누구나 호출), 캐시 금지. 경량 DB SELECT 1회로 DB 연결까지 확인.
// 이 링크는 방학 중 서비스가 죽지 않게 하는 생명줄(규칙 #9) — 삭제·비활성화 금지.

import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // 캐시 금지(매 호출 실제 DB 조회)

export async function GET(): Promise<Response> {
  const time = new Date().toISOString();
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json(
      { ok: true, db: 'up', time },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json(
      { ok: false, db: 'down', time },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
