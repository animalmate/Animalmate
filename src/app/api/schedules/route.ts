// 동아리 일정 목록·등록.
//  - 조회(GET): 운영진 이상. 보이는 범위는 visibility 가 가른다(서비스가 WHERE 로 강제).
//  - 등록(POST): 회장단·시스템관리자만(서비스의 requireAuthorized 가 판단 — 여기 검사는 빠른 거절용).
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus } from '@/auth/permissions';
import { listSchedules, createSchedule, ScheduleInputError } from '@/schedules/schedules';
import { toScheduleView } from '@/schedules/view';
import { PermissionError } from '@/auth/guard';
import { internalError } from '@/http/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateParam = (v: string | null): string | undefined => (v && DATE_RE.test(v) ? v : undefined);

export async function GET(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const url = new URL(req.url);
  const rows = await listSchedules(db, actor, {
    from: dateParam(url.searchParams.get('from')),
    to: dateParam(url.searchParams.get('to')),
  });
  return NextResponse.json({ schedules: rows.map(toScheduleView) });
}

export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const b = await req.json();
    const row = await createSchedule(db, actor, {
      title: String(b.title ?? ''),
      startDate: String(b.startDate ?? ''),
      endDate: b.endDate == null ? null : String(b.endDate),
      startTime: b.startTime == null ? null : String(b.startTime),
      place: b.place == null ? null : String(b.place),
      details: b.details == null ? null : String(b.details),
      visibility: b.visibility,
    });
    return NextResponse.json({ schedule: toScheduleView(row) });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    // 입력 오류는 사용자가 고칠 수 있는 것이라 사유를 그대로 돌려준다(사람 말 문구).
    if (e instanceof ScheduleInputError) return NextResponse.json({ error: 'bad_input', message: e.message }, { status: 400 });
    return internalError('POST /api/schedules', e);
  }
}
