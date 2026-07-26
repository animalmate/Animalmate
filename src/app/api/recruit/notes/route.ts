import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus } from '@/auth/permissions';
import { upsertScreenNote, getScreenNote } from '@/recruit/notes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const contextKey = url.searchParams.get('contextKey');
  if (!contextKey) return NextResponse.json({ error: 'missing_contextKey' }, { status: 400 });

  const note = await getScreenNote(contextKey);
  return NextResponse.json({ note });
}

export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    const body = await req.json();
    const { contextKey, content } = body;
    if (!contextKey || content === undefined) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
    }

    const note = await upsertScreenNote(contextKey, String(content), actor.userId);
    return NextResponse.json({ note });
  } catch (e: any) {
    return NextResponse.json({ error: 'internal', message: e?.message }, { status: 500 });
  }
}
