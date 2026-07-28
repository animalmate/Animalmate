import { describe, it, expect } from 'vitest';
import { recruitStatusBadge, BADGE_TONE_CLASS } from './status-label';
import type { RecruitStatus } from './status';

// 이 테스트가 막으려는 사고: 상태를 하나 늘렸는데 어느 화면의 라벨 사슬만 안 고쳐져,
// 그 상태가 조용히 '진행 중' 같은 엉뚱한 문구로 표시되는 것.
// 실제로 최종 결정 화면에서 서류 불합격자가 '진행 중'으로 보였다.
const ALL: RecruitStatus[] = [
  'received',
  'doc_fail',
  'doc_pass',
  'interview_done',
  'interview_noshow',
  'final_pass',
  'final_fail',
];

describe('모집 상태 배지', () => {
  it('모든 상태에 고유한 라벨이 있다', () => {
    const labels = ALL.map((s) => recruitStatusBadge(s).label);
    expect(labels).not.toContain('진행 중');
    expect(new Set(labels).size).toBe(ALL.length); // 두 상태가 같은 문구를 쓰면 구분이 안 된다
    for (const l of labels) expect(l).not.toMatch(/알 수 없는 상태/);
  });

  it('합격과 불합격은 색 계열이 다르다', () => {
    expect(recruitStatusBadge('doc_pass').tone).toBe('pass');
    expect(recruitStatusBadge('final_pass').tone).toBe('pass');
    // 떨어진 사람은 전부 fail — 예전엔 doc_fail 이 심사 전과 같은 회색으로 묶였다.
    expect(recruitStatusBadge('doc_fail').tone).toBe('fail');
    expect(recruitStatusBadge('final_fail').tone).toBe('fail');
    expect(recruitStatusBadge('interview_noshow').tone).toBe('fail');
    // 아직 아무 결과도 없는 사람만 pending.
    expect(recruitStatusBadge('received').tone).toBe('pending');
  });

  it('모르는 상태는 감추지 않고 드러낸다', () => {
    const b = recruitStatusBadge('some_new_status');
    expect(b.label).toContain('some_new_status');
  });

  it('모든 계열에 클래스가 있다', () => {
    for (const s of ALL) {
      expect(BADGE_TONE_CLASS[recruitStatusBadge(s).tone]).toBeTruthy();
    }
  });
});
