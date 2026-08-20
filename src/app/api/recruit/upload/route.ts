import { NextResponse } from 'next/server';
import { internalError } from '@/http/errors';
import { getCurrentActor } from '@/auth/current-user';
import { isPrivileged } from '@/auth/permissions';
import {
  parseCsv,
  mapRowsToApplicants,
  detectDuplicates,
  missingRequiredMappings,
  buildDuplicatePairs,
  REQUIRED_MAPPING_LABELS,
} from '@/recruit/csv';
import { looksLikeAddress } from '@/recruit/near-station';
import { bulkCreateApplicants, listApplicantDupKeysByCohort } from '@/recruit/applicants';

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
    const {
      applicants: parsedApplicants,
      skipped,
      sourceRows,
    } = mapRowsToApplicants(headers, rows, mapping);

    // 중복 판정은 이름·전화만 있으면 된다. 기수 전체를 전문까지 읽어 오면 203명 기수에서
    // 미리보기 한 번에 수백 KB 를 읽고 버린다.
    const existing = await listApplicantDupKeysByCohort(cohortId);
    const { duplicateIndexes, uniqueApplicants, duplicateHits } = detectDuplicates(
      parsedApplicants,
      existing
    );

    // 확정 전 사전검증 단계
    if (!confirmImport) {
      // "중복 N명"만으로는 그게 재제출인지(=고친 쪽이 버려지는 중인지) 알 길이 없었다.
      // 어느 행이 어느 행 때문에 빠지는지, 각각 언제 낸 것인지를 함께 준다(결정 117).
      // 제출 시각은 저장하지 않는다 — 미리보기에서만 쓴다.
      const duplicatePairs = buildDuplicatePairs({
        headers,
        rows,
        applicants: parsedApplicants,
        sourceRows,
        hits: duplicateHits,
      });

      // 주소 경고는 **등록될 전부**를 센다. 예전에는 샘플 5행에만 배지를 그려서, 진짜 상세 주소가
      // 6번째 행부터면 아무도 보지 못했다(33기 실제 1건).
      const addressLike = uniqueApplicants
        .map((a, idx) => ({ name: a.name, nearStation: a.nearStation ?? '', idx }))
        .filter((a) => looksLikeAddress(a.nearStation));

      return NextResponse.json({
        totalRows: rows.length,
        totalParsed: parsedApplicants.length,
        duplicateCount: duplicateIndexes.length,
        uniqueCount: uniqueApplicants.length,
        sample: uniqueApplicants.slice(0, 5),
        duplicateIndexes,
        duplicatePairs,
        invalidCount: skipped.length,
        invalidRows: skipped.slice(0, 10),
        addressLikeCount: addressLike.length,
        addressLikeRows: addressLike.slice(0, 5).map(({ name, nearStation }) => ({ name, nearStation })),
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
