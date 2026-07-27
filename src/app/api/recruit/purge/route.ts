import { NextResponse } from 'next/server';
import { internalError } from '@/http/errors';
import { getCurrentActor } from '@/auth/current-user';
import { isPrivileged } from '@/auth/permissions';
import { purgeCohortApplicants, PurgeNotAllowedError } from '@/recruit/purge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isPrivileged(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    const body = await req.json();
    const { cohortId, confirmText } = body;

    if (!cohortId || confirmText !== '데이터 삭제 확정') {
      return NextResponse.json({ error: 'invalid_confirmation' }, { status: 400 });
    }

    const archivedStats = await purgeCohortApplicants(cohortId, actor.userId);
    return NextResponse.json({ success: true, archivedStats });
  } catch (e) {
    if (e instanceof PurgeNotAllowedError) {
      return NextResponse.json({ error: 'purge_not_allowed', message: e.message }, { status: 409 });
    }
    return internalError('recruit/purge POST', e);
  }
}
