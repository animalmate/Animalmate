import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { isStaffPlus } from '@/auth/permissions';
import { listUsableTemplates, createTemplate, type TemplateOwnerType } from '@/publishing/post-templates';
import { listAllTeams } from '@/org/teams';
import { PermissionError } from '@/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !isStaffPlus(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const [rows, teams] = await Promise.all([listUsableTemplates(db, actor), listAllTeams(db)]);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const templates = rows.map((t) => ({
    id: t.id,
    ownerType: t.ownerType,
    ownerId: t.ownerId,
    teamName: t.ownerType === 'team' && t.ownerId ? (teamName.get(t.ownerId) ?? null) : null,
    name: t.name,
    titleTemplate: t.titleTemplate,
    bodyTemplate: t.bodyTemplate,
  }));
  return NextResponse.json({ templates });
}

export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const t = await req.json();
    const ownerType = t.ownerType as TemplateOwnerType;
    const tpl = await createTemplate(db, actor, {
      ownerType,
      ownerId: ownerType === 'personal' ? actor.userId : ownerType === 'team' ? t.ownerId : null,
      name: String(t.name),
      titleTemplate: String(t.titleTemplate),
      bodyTemplate: String(t.bodyTemplate),
    });
    return NextResponse.json({ template: tpl });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'internal', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
