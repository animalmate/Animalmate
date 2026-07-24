// 문서 조회(편집용)·수정·삭제 — 소유자/회장단. PII 확인·재임베딩은 서비스가 처리.
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus, isPrivileged, ownsResource } from '@/auth/permissions';
import { getDocument, updateDocument, deleteDocument, PiiBlockedError, type DocumentPatch, type Visibility } from '@/rag/documents';
import { PermissionError } from '@/auth/guard';
import { internalError } from '@/http/errors';
import { LIMITS, InputTooLongError, checkLength } from '@/http/input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VIS: readonly unknown[] = ['member', 'staff', 'board'];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const doc = await getDocument(db, id);
  if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  // 비회장단은 소유(본인/소속 팀) 문서만 편집 열람.
  if (!isPrivileged(actor.role) && !ownsResource(actor, { ownerType: doc.ownerType, ownerId: doc.ownerId })) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return NextResponse.json({
    document: {
      id: doc.id,
      title: doc.title,
      contentMd: doc.contentMd,
      visibility: doc.visibility,
      ownerType: doc.ownerType,
      ownerId: doc.ownerId,
    },
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const b = await req.json();
    const patch: DocumentPatch = {};
    if (b.title !== undefined) patch.title = String(b.title);
    if (b.contentMd !== undefined) patch.contentMd = String(b.contentMd);
    if (b.visibility !== undefined) {
      if (!VIS.includes(b.visibility)) return NextResponse.json({ error: 'bad_visibility' }, { status: 400 });
      patch.visibility = b.visibility as Visibility;
    }
    if (b.piiAck === true) patch.piiAck = true;
    checkLength('제목', patch.title, LIMITS.title);
    checkLength('본문', patch.contentMd, LIMITS.contentMd);
    const doc = await updateDocument(db, actor, id, patch);
    return NextResponse.json({ document: { id: doc.id, title: doc.title, visibility: doc.visibility } });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof PiiBlockedError) return NextResponse.json({ error: 'pii', findings: e.findings }, { status: 422 });
    if (e instanceof InputTooLongError) return NextResponse.json({ error: 'too_long', field: e.field, max: e.max }, { status: 400 });
    return internalError('PATCH /api/documents/[id]', e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await deleteDocument(db, actor, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    return internalError('DELETE /api/documents/[id]', e);
  }
}
