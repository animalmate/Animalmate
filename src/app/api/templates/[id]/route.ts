import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import {
  updateTemplate,
  deleteTemplate,
  parseDefaultPlace,
  parseDefaultCapacity,
  parseDefaultTime,
  type UpdateTemplatePatch,
} from '@/publishing/post-templates';
import { PermissionError } from '@/auth/guard';
import { internalError } from '@/http/errors';
import { LIMITS, InputTooLongError, checkLength } from '@/http/input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 템플릿 수정(이름/제목/본문). 소유권은 서비스(authorizeTemplate)가 검증.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const b = await req.json();
    const patch: UpdateTemplatePatch = {};
    if (b.name !== undefined) patch.name = String(b.name);
    if (b.titleTemplate !== undefined) patch.titleTemplate = String(b.titleTemplate);
    if (b.bodyTemplate !== undefined) patch.bodyTemplate = String(b.bodyTemplate);
    checkLength('이름', patch.name, LIMITS.name);
    checkLength('제목', patch.titleTemplate, LIMITS.title);
    checkLength('본문', patch.bodyTemplate, LIMITS.contentMd);
    if (b.defaultPlace !== undefined) patch.defaultPlace = parseDefaultPlace(b.defaultPlace);
    if (b.defaultCapacity !== undefined) patch.defaultCapacity = parseDefaultCapacity(b.defaultCapacity);
    if (b.defaultMeetTime !== undefined) patch.defaultMeetTime = parseDefaultTime(b.defaultMeetTime);
    if (b.defaultPublishTime !== undefined) patch.defaultPublishTime = parseDefaultTime(b.defaultPublishTime);
    const tpl = await updateTemplate(db, actor, id, patch);
    return NextResponse.json({ template: tpl });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (e instanceof InputTooLongError) return NextResponse.json({ error: 'too_long', field: e.field, max: e.max }, { status: 400 });
    return internalError('PATCH /api/templates/[id]', e);
  }
}

// 템플릿 삭제(하드). recurring_rules.template_id 는 set null 로 정리됨.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await deleteTemplate(db, actor, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    return internalError('DELETE /api/templates/[id]', e);
  }
}
