import { describe, it, expect } from 'vitest';
import {
  nextStatusOnScoreChange,
  canConfirmDoc,
  canConfirmFinal,
  canTransition,
} from './status';
import { parseCsv, mapRowToApplicant, detectDuplicates } from './csv';
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

describe('CSV Parser & Mapper', () => {
  it('parses CSV with multiline quotes and escaped quotes safely', () => {
    const csv = `이름,전화번호,자기소개
홍길동,010-1234-5678,"안녕하세요.
저는 ""동물""을 사랑합니다."
김철수,010-9876-5432,반갑습니다.`;

    const { headers, rows } = parseCsv(csv);
    expect(headers).toEqual(['이름', '전화번호', '자기소개']);
    expect(rows).toHaveLength(2);
    expect(rows[0]![0]).toBe('홍길동');
    expect(rows[0]![2]).toBe('안녕하세요.\n저는 "동물"을 사랑합니다.');
    expect(rows[1]![0]).toBe('김철수');
  });

  it('maps header row to applicant object', () => {
    const headers = ['이름', '연락처', '지원동기'];
    const row = ['홍길동', '010-1234-5678', '열심히하겠습니다'];
    const mapping = {
      name: '이름',
      phone: '연락처',
      essayIntro: '지원동기',
    };

    const mapped = mapRowToApplicant(headers, row, mapping);
    expect(mapped).not.toBeNull();
    expect(mapped?.name).toBe('홍길동');
    expect(mapped?.phone).toBe('01012345678');
    expect(mapped?.essayIntro).toBe('열심히하겠습니다');
  });

  it('detects duplicate applicants by name and clean phone', () => {
    const newApps = [
      { name: '홍길동', phone: '010-1234-5678' },
      { name: '김철수', phone: '010-9876-5432' },
      { name: '홍길동', phone: '01012345678' },
    ];
    const existing = [{ name: '김철수', phone: '01098765432' }];

    const { duplicateIndexes, uniqueApplicants } = detectDuplicates(newApps, existing);
    expect(duplicateIndexes).toEqual([1, 2]); // 김철수 (기존과 중복), 3번째 홍길동 (새 목록 내 중복)
    expect(uniqueApplicants).toHaveLength(1);
    expect(uniqueApplicants[0]!.name).toBe('홍길동');
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
