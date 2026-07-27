import { describe, it, expect } from 'vitest';
// purge.ts 가 아니라 purge-rules.ts 에서 가져온다 — purge.ts 는 db/client 를 import 한다.
import { purgeBlockReason } from './purge-rules';

// 폐기는 되돌릴 수 없고, 끝나면 archived_stats 만 남는다.
// 그 상태에서 한 번 더 실행하면 지원자가 0명이라 집계가 전부 0 으로 덮여 통계까지 사라졌다.
describe('폐기 실행 가드', () => {
  it('아직 폐기하지 않은 기수는 막지 않는다', () => {
    expect(purgeBlockReason({ label: '33기', archivedStats: null })).toBeNull();
  });

  it('없는 기수는 막는다 — 잘못된 id 로 조용히 성공하면 안 된다', () => {
    expect(purgeBlockReason(undefined)).toBe('해당 기수를 찾을 수 없습니다.');
  });

  it('이미 폐기된 기수는 막는다 — 재실행하면 남은 집계가 지워진다', () => {
    const reason = purgeBlockReason({
      label: '32기',
      archivedStats: { totalApplicants: 47, finalPassCount: 12 },
    });
    expect(reason).toContain('32기');
    expect(reason).toContain('이미 폐기');
  });

  it('지원자가 0명이었던 기수의 집계도 폐기 완료로 본다', () => {
    // totalApplicants 0 은 falsy 가 아니라 객체다 — 객체 존재 여부로 판정해야 재폐기가 막힌다.
    expect(purgeBlockReason({ label: '31기', archivedStats: { totalApplicants: 0 } })).not.toBeNull();
  });
});
