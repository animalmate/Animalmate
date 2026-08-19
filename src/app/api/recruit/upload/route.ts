import { NextResponse } from 'next/server';
import { internalError } from '@/http/errors';
import { getCurrentActor } from '@/auth/current-user';
import { isPrivileged } from '@/auth/permissions';
import {
  parseCsv,
  mapRowsToApplicants,
  detectDuplicates,
  missingRequiredMappings,
  REQUIRED_MAPPING_LABELS,
} from '@/recruit/csv';
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

    // 이름·전화번호가 연결되지 않으면 mapRowToApplicant 가 모든 행을 버려서 "0명"만 나온다.
    // 왜 0명인지 화면에 아무 단서가 없어 실제로 한 번 헤맸다 — 원인을 그대로 돌려준다.
    const missing = missingRequiredMappings(headers, mapping);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: 'unmapped_required_field',
          message: `필수 항목(${missing
            .map((k) => REQUIRED_MAPPING_LABELS[k])
            .join(', ')})이 엑셀 열과 연결되지 않았습니다. 항목 연결을 확인해 주세요.`,
        },
        { status: 400 }
      );
    }

    // 이름·전화번호가 빈 행은 등록되지 않는다. **몇 행이 왜 빠졌는지 함께** 돌려준다 —
    // 숫자만 보여 주면 50명을 올리고 48명이 들어가도 사람이 알아챌 방법이 없다.
    const { applicants: parsedApplicants, skipped } = mapRowsToApplicants(headers, rows, mapping);

    const existing = await listApplicantsByCohort(cohortId);
    const { duplicateIndexes, uniqueApplicants } = detectDuplicates(parsedApplicants, existing);

    // 확정 전 사전검증 단계
    if (!confirmImport) {
      return NextResponse.json({
        totalRows: rows.length,
        totalParsed: parsedApplicants.length,
        duplicateCount: duplicateIndexes.length,
        uniqueCount: uniqueApplicants.length,
        sample: uniqueApplicants.slice(0, 5),
        duplicateIndexes,
        invalidCount: skipped.length,
        invalidRows: skipped.slice(0, 10),
      });
    }

    // 확정 저장
    const created = await bulkCreateApplicants(cohortId, actor.userId, uniqueApplicants);
    return NextResponse.json({
      success: true,
      importedCount: created.length,
      skippedCount: duplicateIndexes.length,
      invalidCount: skipped.length,
    });
  } catch (e) {
    return internalError('recruit/upload POST', e);
  }
}
