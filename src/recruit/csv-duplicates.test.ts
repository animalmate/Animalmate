import { describe, it, expect } from 'vitest';
import {
  parseCsv,
  mapRowsToApplicants,
  detectDuplicates,
  buildDuplicatePairs,
  findTimestampColumn,
} from './csv';

// 33기에서 중복 3쌍이 전부 재제출이었고, 규칙상 **고친 쪽이 버려질 뻔했다**(결정 117).
// 화면에는 "중복 N명"밖에 없어 판단할 거리가 보이지 않았다. 여기서는 그 판단 재료
// (어느 행이 어느 행 때문에 빠지는가 · 각각 언제 낸 것인가)가 끝까지 실려 오는지를 고정한다.
//
// ⚠ 규칙을 베껴 적지 않는다 — 업로드 API 가 실제로 부르는 함수를 그대로 호출한다.
const MAPPING = { name: '이름', phone: '전화번호', essayIntro: '자기소개' };

// 구글 폼 응답 시트 모양(첫 열이 타임스탬프). 값은 전부 가짜다.
const CSV = [
  '타임스탬프,이름,전화번호,자기소개',
  '2026. 8. 15 오전 10:22:01,김하늘,010-1111-2222,처음 낸 지원서입니다',
  '2026. 8. 16 오후 1:00:00,,010-3333-4444,이름이 비어 등록되지 않는 행',
  '2026. 8. 17 오후 9:03:12,김하늘,01011112222,보완하여 다시 작성해 제출합니다',
].join('\n');

describe('재제출 중복 — 무엇이 버려지는지 화면이 말할 수 있어야 한다', () => {
  it('빠지는 행과 남는 행을 제출 시각과 함께 알려 준다', () => {
    const { headers, rows } = parseCsv(CSV);
    const { applicants, skipped, sourceRows } = mapRowsToApplicants(headers, rows, MAPPING);

    // 이름이 빈 2번째 행이 빠지므로 지원자 index 와 원본 행 번호가 어긋난다 — 그래서 sourceRows 가 있다.
    expect(applicants).toHaveLength(2);
    expect(skipped.map((s) => s.row)).toEqual([2]);
    expect(sourceRows).toEqual([1, 3]);

    const { duplicateIndexes, uniqueApplicants, duplicateHits } = detectDuplicates(applicants, []);
    // 먼저 낸 것이 남고 뒤엣것이 빠진다(결정 117 — 규칙 자체는 바꾸지 않았다).
    expect(duplicateIndexes).toEqual([1]);
    expect(uniqueApplicants).toHaveLength(1);
    expect(duplicateHits).toEqual([{ index: 1, keptIndex: 0 }]);

    const pairs = buildDuplicatePairs({ headers, rows, applicants, sourceRows, hits: duplicateHits });
    expect(pairs).toEqual([
      {
        row: 3,
        name: '김하늘',
        submittedAt: '2026. 8. 17 오후 9:03:12',
        keptRow: 1,
        keptSubmittedAt: '2026. 8. 15 오전 10:22:01',
      },
    ]);
  });

  it('이미 등록된 지원자와 겹치면 남는 쪽이 파일 밖이라는 것을 알린다', () => {
    const { headers, rows } = parseCsv(CSV);
    const { applicants, sourceRows } = mapRowsToApplicants(headers, rows, MAPPING);
    const { duplicateHits } = detectDuplicates(applicants, [
      { name: '김하늘', phone: '010-1111-2222' },
    ]);

    const pairs = buildDuplicatePairs({ headers, rows, applicants, sourceRows, hits: duplicateHits });
    expect(pairs.map((p) => p.row)).toEqual([1, 3]);
    expect(pairs.every((p) => p.keptRow === null)).toBe(true);
    expect(pairs.every((p) => p.keptSubmittedAt === '')).toBe(true);
  });

  it('타임스탬프 열이 없어도 행 번호로 순서를 알 수 있다', () => {
    const noTs = CSV.split('\n')
      .map((line) => line.split(',').slice(1).join(','))
      .join('\n');
    const { headers, rows } = parseCsv(noTs);
    expect(findTimestampColumn(headers)).toBe(-1);

    const { applicants, sourceRows } = mapRowsToApplicants(headers, rows, MAPPING);
    const { duplicateHits } = detectDuplicates(applicants, []);
    const pairs = buildDuplicatePairs({ headers, rows, applicants, sourceRows, hits: duplicateHits });

    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.row).toBe(3);
    expect(pairs[0]!.keptRow).toBe(1);
    expect(pairs[0]!.submittedAt).toBe(''); // 시각은 없지만 행 번호로 먼저·나중이 드러난다
  });

  it('타임스탬프 열은 이름이 조금 달라도 찾는다', () => {
    expect(findTimestampColumn(['타임스탬프', '이름'])).toBe(0);
    expect(findTimestampColumn(['이름', '타임 스탬프'])).toBe(1);
    expect(findTimestampColumn(['이름', 'Timestamp'])).toBe(1);
    expect(findTimestampColumn(['이름', '응답 시각'])).toBe(1);
    expect(findTimestampColumn(['이름', '제출 시각'])).toBe(1);
    expect(findTimestampColumn(['이름', '전화번호'])).toBe(-1);
  });

  it('너무 많으면 화면이 감당할 만큼만 준다', () => {
    const rows = Array.from({ length: 30 }, () => ['같은사람', '01011112222']);
    const headers = ['이름', '전화번호'];
    const mapped = mapRowsToApplicants(headers, rows, { name: '이름', phone: '전화번호' });
    const { duplicateHits } = detectDuplicates(mapped.applicants, []);

    expect(duplicateHits).toHaveLength(29); // 첫 행만 남는다
    const pairs = buildDuplicatePairs({
      headers,
      rows,
      applicants: mapped.applicants,
      sourceRows: mapped.sourceRows,
      hits: duplicateHits,
    });
    expect(pairs).toHaveLength(10);
  });
});
