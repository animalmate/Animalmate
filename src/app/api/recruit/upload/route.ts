import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/auth/current-user';
import { isPrivileged } from '@/auth/permissions';
import { parseCsv, mapRowToApplicant, detectDuplicates, ApplicantImportInput } from '@/recruit/csv';
import { bulkCreateApplicants, listApplicantsByCohort } from '@/recruit/applicants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const actor = await getCurrentActor();
  if (!actor || !actor.membershipActive) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isPrivileged(actor.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    const body = await req.json();
    const { cohortId, csvText, mapping, confirmImport } = body;

    if (!cohortId || !csvText || !mapping) {
      return NextResponse.json({ error: 'missing_parameters' }, { status: 400 });
    }

    const { headers, rows } = parseCsv(csvText);
    const parsedApplicants: ApplicantImportInput[] = [];

    rows.forEach((row) => {
      const app = mapRowToApplicant(headers, row, mapping);
      if (app) {
        parsedApplicants.push(app);
      }
    });

    const existing = await listApplicantsByCohort(cohortId);
    const { duplicateIndexes, uniqueApplicants } = detectDuplicates(parsedApplicants, existing);

    // 확정 전 사전검증 단계
    if (!confirmImport) {
      return NextResponse.json({
        totalParsed: parsedApplicants.length,
        duplicateCount: duplicateIndexes.length,
        uniqueCount: uniqueApplicants.length,
        sample: uniqueApplicants.slice(0, 5),
        duplicateIndexes,
      });
    }

    // 확정 저장
    const created = await bulkCreateApplicants(cohortId, actor.userId, uniqueApplicants);
    return NextResponse.json({
      success: true,
      importedCount: created.length,
      skippedCount: duplicateIndexes.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'internal', message: e?.message }, { status: 500 });
  }
}
