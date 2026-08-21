import { describe, it, expect } from 'vitest';
import {
  nextStatusOnScoreChange,
  canConfirmDoc,
  canConfirmFinal,
  canTransition,
  canMarkAttendance,
} from './status';
// scores.ts 가 아니라 score-rules.ts 에서 가져온다 — scores.ts 는 db/client 를 import 하므로
// DB 연결 없는 순수 단위 테스트에서 로드하면 DATABASE_URL 에러가 난다.
import { validateScore } from './score-rules';
import { aggregateScoresByApplicant } from './aggregate';

describe('Recruit Status Transitions', () => {
  it('automatically transitions doc_pass to interview_done when interview scores exist', () => {
    expect(nextStatusOnScoreChange('doc_pass', 1)).toBe('interview_done');
    expect(nextStatusOnScoreChange('doc_pass', 3)).toBe('interview_done');
  });

  it('automatically transitions interview_noshow to interview_done when interview scores are added', () => {
    expect(nextStatusOnScoreChange('interview_noshow', 1)).toBe('interview_done');
  });

  it('automatically reverts interview_done to doc_pass when interview score count drops to 0', () => {
    expect(nextStatusOnScoreChange('interview_done', 0)).toBe('doc_pass');
  });

  it('does not affect other manual statuses', () => {
    expect(nextStatusOnScoreChange('received', 1)).toBe('received');
    expect(nextStatusOnScoreChange('doc_fail', 1)).toBe('doc_fail');
    expect(nextStatusOnScoreChange('final_pass', 0)).toBe('final_pass');
  });

  it('checks status guards correctly', () => {
    expect(canConfirmDoc('received')).toBe(true);
    expect(canConfirmDoc('doc_pass')).toBe(false);

    expect(canConfirmFinal('interview_done')).toBe(true);
    expect(canConfirmFinal('interview_noshow')).toBe(true);
    expect(canConfirmFinal('received')).toBe(false);
  });
});

describe('Score Validation & Aggregation', () => {
  it('validates scores in 0.0~10.0 range with 0.5 increments', () => {
    expect(validateScore(0)).toBe(true);
    expect(validateScore(7.5)).toBe(true);
    expect(validateScore(10.0)).toBe(true);

    expect(validateScore(7.3)).toBe(false);
    expect(validateScore(-0.5)).toBe(false);
    expect(validateScore(10.5)).toBe(false);
  });

  it('aggregates scores and calculates averages and sample size deficiency', () => {
    const applicantIds = ['app1', 'app2'];
    const scores = [
      { applicantId: 'app1', scorerUserId: 'u1', stage: 'document' as const, score: '8.0' },
      { applicantId: 'app1', scorerUserId: 'u2', stage: 'document' as const, score: '9.0' },
      { applicantId: 'app1', scorerUserId: 'u3', stage: 'document' as const, score: '7.0' },
      { applicantId: 'app2', scorerUserId: 'u1', stage: 'document' as const, score: '6.0' },
    ];

    const agg = aggregateScoresByApplicant(applicantIds, scores);

    expect(agg['app1']!.docScoreAvg).toBe(8.0);
    expect(agg['app1']!.docScoreMin).toBe(7.0);
    expect(agg['app1']!.docScoreMax).toBe(9.0);
    expect(agg['app1']!.docScorerCount).toBe(3);
    expect(agg['app1']!.isDocSampleDeficient).toBe(false);

    expect(agg['app2']!.docScoreAvg).toBe(6.0);
    expect(agg['app2']!.docScorerCount).toBe(1);
    expect(agg['app2']!.isDocSampleDeficient).toBe(true); // < 3명
  });
});

// 이 규칙이 없으면 심사·면접을 건너뛴 지원자가 최종 합격이 될 수 있다.
// 최종 결정 화면은 팀으로만 걸러서 received 상태도 목록에 뜨기 때문에, 전체 선택 한 번이면 벌어진다.
describe('수동 상태 전이 가드', () => {
  it('서류 확정은 접수 상태에서만 가능하다', () => {
    expect(canTransition('received', 'doc_pass')).toBe(true);
    expect(canTransition('received', 'doc_fail')).toBe(true);
    expect(canTransition('doc_pass', 'doc_fail')).toBe(false);
    expect(canTransition('interview_done', 'doc_pass')).toBe(false);
  });

  it('최종 확정은 면접을 마쳤거나 불참한 사람만 가능하다', () => {
    expect(canTransition('interview_done', 'final_pass')).toBe(true);
    expect(canTransition('interview_noshow', 'final_fail')).toBe(true);
    // 단계 건너뛰기 — 이게 막히지 않아 실제로 위험했다.
    expect(canTransition('received', 'final_pass')).toBe(false);
    expect(canTransition('doc_pass', 'final_pass')).toBe(false);
    expect(canTransition('doc_fail', 'final_pass')).toBe(false);
  });

  it('면접 불참은 배정 이후 단계에서만 표시할 수 있다', () => {
    expect(canTransition('doc_pass', 'interview_noshow')).toBe(true);
    expect(canTransition('interview_done', 'interview_noshow')).toBe(true);
    expect(canTransition('received', 'interview_noshow')).toBe(false);
  });

  // 불참은 면접관이 현장에서 누르는 표시라 잘못 누를 수 있다. 되돌릴 수 없으면 그때마다
  // 회장단을 불러야 한다 — 되돌아갈 자리는 "면접 전"인 doc_pass 다(2026-07-31).
  it('면접 불참은 되돌릴 수 있다(면접 전 상태로)', () => {
    expect(canTransition('interview_noshow', 'doc_pass')).toBe(true);
  });

  it('되돌리기가 서류 심사 단계를 되살리지는 않는다', () => {
    // doc_fail 은 여전히 received 에서만 갈 수 있다 — 불참을 되돌린다고 서류가 다시 열리면 안 된다.
    expect(canTransition('interview_noshow', 'doc_fail')).toBe(false);
    expect(canTransition('interview_done', 'doc_pass')).toBe(false); // 점수 삭제로만(자동 전이)
  });

  it('면접 완료와 접수 상태는 수동으로 지정할 수 없다', () => {
    // 면접 완료는 "점수가 있다"는 사실의 반영이라 자동 전이로만 정해진다.
    expect(canTransition('doc_pass', 'interview_done')).toBe(false);
    expect(canTransition('final_pass', 'received')).toBe(false);
  });

  it('같은 상태로의 전이는 허용하지 않는다', () => {
    expect(canTransition('doc_pass', 'doc_pass')).toBe(false);
    expect(canTransition('final_pass', 'final_pass')).toBe(false);
  });

  it('이미 최종 결정된 사람은 되돌릴 수 없다', () => {
    expect(canTransition('final_pass', 'final_fail')).toBe(false);
    expect(canTransition('final_fail', 'doc_pass')).toBe(false);
  });
});

// 기존 집계 테스트는 2명짜리라, 실제 모집 규모에서 한 명이라도 결과에서 빠지거나 표본 부족
// 표시가 틀리는 것을 잡지 못한다. 표본 부족(3명 미만)은 "이 사람은 더 봐야 한다"는 신호라
// 틀리면 채점이 덜 된 지원자가 충분히 검토된 것처럼 보인 채 최종 결정에 들어간다.
describe('실전 규모 집계(50명) — 누락·표본 부족 판정', () => {
  const TOTAL = 50;
  const ids = Array.from({ length: TOTAL }, (_, i) => `app${String(i + 1).padStart(2, '0')}`);

  // 채점자 수를 일부러 층으로 나눈다: 충분(3명) / 부족(2명·1명) / 미채점(0명).
  const SUFFICIENT_END = 40; // 0~39: 3명 채점
  const TWO_END = 45; // 40~44: 2명
  const ONE_END = 48; // 45~47: 1명, 48~49: 0명

  const scores = ids.flatMap((id, idx) => {
    const scorerCount =
      idx < SUFFICIENT_END ? 3 : idx < TWO_END ? 2 : idx < ONE_END ? 1 : 0;
    // 7.0 / 8.0 / 9.0 순으로 배정 — 3명이면 평균 8.0, 최저 7.0, 최고 9.0 이 된다.
    const values = ['7.0', '8.0', '9.0'];
    return Array.from({ length: scorerCount }, (_, s) => ({
      applicantId: id,
      scorerUserId: `u${s + 1}`,
      stage: 'interview' as const,
      score: values[s]!,
    }));
  });

  const agg = aggregateScoresByApplicant(ids, scores);

  it('50명 전원이 결과에 남는다 — 한 명도 조용히 빠지지 않는다', () => {
    expect(Object.keys(agg)).toHaveLength(TOTAL);
    ids.forEach((id) => expect(agg[id]).toBeDefined());
  });

  it('3명이 채점한 지원자는 표본 충분으로 잡히고 평균·최저·최고가 맞는다', () => {
    const full = agg['app01']!;
    expect(full.interviewScorerCount).toBe(3);
    expect(full.isInterviewSampleDeficient).toBe(false);
    expect(full.interviewScoreAvg).toBe(8.0);
    expect(full.interviewScoreMin).toBe(7.0);
    expect(full.interviewScoreMax).toBe(9.0);
  });

  it('2명·1명 채점은 표본 부족으로 잡힌다(경계값 3명 미만)', () => {
    const two = agg['app41']!; // 40번째 인덱스 = 2명 채점
    expect(two.interviewScorerCount).toBe(2);
    expect(two.isInterviewSampleDeficient).toBe(true);
    expect(two.interviewScoreAvg).toBe(7.5);

    const one = agg['app46']!; // 45번째 인덱스 = 1명 채점
    expect(one.interviewScorerCount).toBe(1);
    expect(one.isInterviewSampleDeficient).toBe(true);
    expect(one.interviewScoreAvg).toBe(7.0);
  });

  it('아무도 채점하지 않은 지원자는 평균이 null 이고 표본 부족이다', () => {
    const none = agg['app50']!;
    expect(none.interviewScorerCount).toBe(0);
    expect(none.isInterviewSampleDeficient).toBe(true);
    expect(none.interviewScoreAvg).toBeNull();
    expect(none.interviewScoreMin).toBeNull();
    expect(none.interviewScoreMax).toBeNull();
  });

  it('표본 부족 인원수가 정확하다 — 충분 40명, 부족 10명', () => {
    const deficient = ids.filter((id) => agg[id]!.isInterviewSampleDeficient);
    expect(deficient).toHaveLength(10); // 2명×5 + 1명×3 + 0명×2
    const sufficient = ids.filter((id) => !agg[id]!.isInterviewSampleDeficient);
    expect(sufficient).toHaveLength(40);
  });

  it('면접 점수만 넣었으므로 서류 집계는 건드려지지 않는다(단계 혼선 방지)', () => {
    ids.forEach((id) => {
      expect(agg[id]!.docScoreAvg).toBeNull();
      expect(agg[id]!.docScorerCount).toBe(0);
      expect(agg[id]!.isDocSampleDeficient).toBe(true);
    });
  });

  it('나누어떨어지지 않는 평균은 소수 첫째 자리로 반올림한다', () => {
    // 7.0 + 8.0 + 8.0 = 23 / 3 = 7.666… → 7.7
    const rounded = aggregateScoresByApplicant(
      ['solo'],
      ['7.0', '8.0', '8.0'].map((score, s) => ({
        applicantId: 'solo',
        scorerUserId: `u${s + 1}`,
        stage: 'interview' as const,
        score,
      }))
    );
    expect(rounded['solo']!.interviewScoreAvg).toBe(7.7);
  });
});

// 면접 출결 — **운영진이 쓰는 경로**의 권한 경계.
// 합격 여부 결정은 회장단 몫이라 bulk_status·update_status 는 회장단 전용으로 막혀 있다.
// 출결로 그 문을 우회할 수 있으면 그 게이트가 무의미해진다(2026-07-31 QA 에서 실제로 열려 있었다).
describe('canMarkAttendance (운영진 출결 경로의 경계)', () => {
  it('면접 단계 지원자만 불참으로 표시할 수 있다', () => {
    expect(canMarkAttendance('doc_pass', true)).toBe(true);
    expect(canMarkAttendance('interview_done', true)).toBe(true);
  });

  it('불참 되돌리기는 불참으로 표시된 사람에게만 열린다', () => {
    expect(canMarkAttendance('interview_noshow', false)).toBe(true);
  });

  it('**received 를 doc_pass 로 올릴 수 없다** — 그건 회장단의 서류 합격 확정이다', () => {
    // canTransition 은 이 전이를 허용한다(서류 확정의 정상 경로라서). 출결 경로는 달라야 한다.
    expect(canTransition('received', 'doc_pass')).toBe(true);
    expect(canMarkAttendance('received', false)).toBe(false);
  });

  it('최종 확정된 지원자는 출결로 건드릴 수 없다', () => {
    for (const s of ['final_pass', 'final_fail'] as const) {
      expect(canMarkAttendance(s, true)).toBe(false);
      expect(canMarkAttendance(s, false)).toBe(false);
    }
  });

  it('서류 불합격자를 출결로 되살릴 수 없다', () => {
    expect(canMarkAttendance('doc_fail', false)).toBe(false);
    expect(canMarkAttendance('doc_fail', true)).toBe(false);
  });
});
