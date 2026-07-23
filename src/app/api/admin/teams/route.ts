import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getCurrentActor } from '@/auth/current-user';
import { isPrivileged } from '@/auth/permissions';
import { listAllTeams, createTeam, type TeamKind } from '@/org/teams';
import { listTeamMembers } from '@/org/team-members';
import { PermissionError } from '@/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !isPrivileged(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const teams = await listAllTeams(db);
  const withMembers = await Promise.all(
    teams.map(async (t) => ({ ...t, members: await listTeamMembers(db, t.id) }))
  );
  return NextResponse.json({ teams: withMembers });
}

export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const b = await req.json();
    const kind: TeamKind = b.kind === 'functional' ? 'functional' : 'activity';
    const team = await createTeam(db, actor, { name: String(b.name), kind });
    return NextResponse.json({ team });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'internal', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
