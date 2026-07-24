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
    if (b.defaultPlace !== undefined) patch.defaultPlace = parseDefaultPlace(b.defaultPlace);
    if (b.defaultCapacity !== undefined) patch.defaultCapacity = parseDefaultCapacity(b.defaultCapacity);
    if (b.defaultMeetTime !== undefined) patch.defaultMeetTime = parseDefaultTime(b.defaultMeetTime);
    if (b.defaultPublishTime !== undefined) patch.defaultPublishTime = parseDefaultTime(b.defaultPublishTime);
    const tpl = await updateTemplate(db, actor, id, patch);
    return NextResponse.json({ template: tpl });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'internal', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
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
    return NextResponse.json({ error: 'internal', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
