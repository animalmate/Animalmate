import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { issueJoinCode, getActiveJoinCode, InvalidJoinCodeError } from '@/auth/join-codes';
import { PermissionError } from '@/auth/guard';
import { internalError } from '@/http/errors';
import { LIMITS, InputTooLongError, checkLength } from '@/http/input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 현재 활성 가입코드 조회(회장단).
export async function GET(): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (actor.role !== 'board' && actor.role !== 'sysadmin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const active = await getActiveJoinCode(db);
  return NextResponse.json({ active: active ? { code: active.code, semesterLabel: active.semesterLabel } : null });
}

// 가입코드 발급/재발급(회장단). 기존 활성 코드는 비활성화.
export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { semesterLabel, code } = await req.json();
    if (!semesterLabel) return NextResponse.json({ error: 'semester_label_required' }, { status: 400 });
    checkLength('학기 이름', String(semesterLabel), LIMITS.semesterLabel);
    const jc = await issueJoinCode(db, actor, { semesterLabel: String(semesterLabel), code: code ? String(code) : undefined });
    return NextResponse.json({ ok: true, code: jc.code, semesterLabel: jc.semesterLabel });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof InvalidJoinCodeError) return NextResponse.json({ error: 'invalid_join_code_format', message: e.message }, { status: 400 });
    if (e instanceof InputTooLongError) return NextResponse.json({ error: 'too_long', field: e.field, max: e.max }, { status: 400 });
    return internalError('POST /api/admin/join-codes', e);
  }
}
