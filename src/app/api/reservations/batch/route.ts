import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { batchGenerate, type BatchPreset, type BatchRange } from '@/publishing/batch-generate';
import { PermissionError } from '@/auth/guard';
import type { Weekday } from '@/recurrence/month-weekday';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 일괄 생성. dryRun=true 면 미리보기(삽입 없음).
export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const b = await req.json();
    const preset: BatchPreset = {
      teamId: String(b.teamId),
      monthWeek: b.monthWeek,
      weekday: Number(b.weekday) as Weekday,
      meetTime: String(b.meetTime || '14:00'),
      boardMenuid: Number(b.boardMenuid),
      templateId: b.templateId || null,
      noticeLeadDays: b.noticeLeadDays != null ? Number(b.noticeLeadDays) : 7,
      publishTime: String(b.publishTime || '20:00'),
    };
    const range: BatchRange = {
      startYear: Number(b.startYear),
      startMonth: Number(b.startMonth),
      endYear: Number(b.endYear),
      endMonth: Number(b.endMonth),
    };
    const result = await batchGenerate(db, actor, preset, range, new Date(), Boolean(b.dryRun));
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'internal', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
