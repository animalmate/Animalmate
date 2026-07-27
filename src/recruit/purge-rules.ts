// 폐기 실행 판정 규칙(순수). purge.ts 는 db/client 를 import 하므로 여기에 따로 둔다 —
// DB 연결 없는 단위 테스트가 purge.ts 를 로드하면 DATABASE_URL 에러로 CI 가 깨진다.

/**
 * 폐기를 막아야 하는 이유. 막을 이유가 없으면 null.
 *
 * 폐기는 되돌릴 수 없고, 끝나면 archived_stats(익명 집계)만 남는다. 이미 폐기한 기수를 다시
 * 폐기하면 지원자가 0명이라 그 집계가 전부 0 으로 덮여, 마지막 기록까지 사라진다.
 * 확인 문구만 통과하면 벌어지는 일이라 서버에서 막는다.
 */
export function purgeBlockReason(
  cohort: { label: string; archivedStats: unknown } | undefined
): string | null {
  if (!cohort) return '해당 기수를 찾을 수 없습니다.';
  if (cohort.archivedStats) {
    return `${cohort.label} 는 이미 폐기된 기수입니다. 다시 실행하면 남아 있는 집계가 지워집니다.`;
  }
  return null;
}
