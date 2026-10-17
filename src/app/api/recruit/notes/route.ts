import { NextResponse } from 'next/server';
import { internalError } from '@/http/errors';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus } from '@/auth/permissions';
import { upsertScreenNote, getScreenNote } from '@/recruit/notes';
import { isValidNoteKey } from '@/recruit/note-keys';
import { LIMITS } from '@/http/input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const contextKey = url.searchParams.get('contextKey');
  if (!contextKey) return NextResponse.json({ error: 'missing_contextKey' }, { status: 400 });
  if (!isValidNoteKey(contextKey)) return NextResponse.json({ error: 'invalid_contextKey' }, { status: 400 });

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
    // 기수 폐기가 지울 수 있는 키만 받는다(note-keys.ts isValidNoteKey 주석).
    if (!isValidNoteKey(contextKey)) return NextResponse.json({ error: 'invalid_contextKey' }, { status: 400 });
    if (String(content).length > LIMITS.contentMd) {
      return NextResponse.json({ error: 'too_long', message: `메모는 ${LIMITS.contentMd}자를 넘을 수 없습니다.` }, { status: 400 });
    }

    const note = await upsertScreenNote(contextKey, String(content), actor.userId);
    return NextResponse.json({ note });
  } catch (e) {
    return internalError('recruit/notes POST', e);
  }
}
