// 문서(RAG 지식베이스) 목록·생성 — 운영진 이상. 소유권·visibility·PII 는 서비스가 검증.
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus } from '@/auth/permissions';
import { listDocuments, createDocument, PiiBlockedError, type Visibility } from '@/rag/documents';
import { PermissionError } from '@/auth/guard';
import { internalError } from '@/http/errors';
import { LIMITS, InputTooLongError, checkLength } from '@/http/input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VIS: readonly unknown[] = ['member', 'staff', 'board'];

export async function GET(): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ documents: await listDocuments(db, actor) });
}

export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const b = await req.json();
    const title = String(b.title ?? '').trim();
    const contentMd = String(b.contentMd ?? '');
    if (!title) return NextResponse.json({ error: 'missing_title' }, { status: 400 });
    if (!VIS.includes(b.visibility)) return NextResponse.json({ error: 'bad_visibility' }, { status: 400 });
    const ownerType = b.ownerType === 'team' ? 'team' : 'personal';
    if (ownerType === 'team' && !b.ownerId) return NextResponse.json({ error: 'missing_team' }, { status: 400 });
    checkLength('제목', title, LIMITS.title);
    checkLength('본문', contentMd, LIMITS.contentMd);

    const doc = await createDocument(db, actor, {
      title,
      contentMd,
      visibility: b.visibility as Visibility,
      ownerType,
      ownerId: ownerType === 'team' ? String(b.ownerId) : actor.userId,
      piiAck: b.piiAck === true,
    });
    return NextResponse.json({ document: { id: doc.id, title: doc.title, visibility: doc.visibility } });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof PiiBlockedError) return NextResponse.json({ error: 'pii', findings: e.findings }, { status: 422 });
    if (e instanceof InputTooLongError) return NextResponse.json({ error: 'too_long', field: e.field, max: e.max }, { status: 400 });
    return internalError('POST /api/documents', e);
  }
}
