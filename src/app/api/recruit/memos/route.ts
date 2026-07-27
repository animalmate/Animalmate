import { NextResponse } from 'next/server';
import { internalError } from '@/http/errors';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus } from '@/auth/permissions';
import { upsertPersonalMemo, getPersonalMemo } from '@/recruit/memos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const applicantId = url.searchParams.get('applicantId');
  if (!applicantId) return NextResponse.json({ error: 'missing_applicantId' }, { status: 400 });

  const memo = await getPersonalMemo(applicantId, actor.userId);
  return NextResponse.json({ memo });
}

export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    const body = await req.json();
    const { applicantId, content } = body;
    if (!applicantId || content === undefined) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
    }

    const memo = await upsertPersonalMemo(applicantId, actor.userId, String(content));
    return NextResponse.json({ memo });
  } catch (e) {
    return internalError('recruit/memos POST', e);
  }
}
