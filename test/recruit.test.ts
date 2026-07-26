import { describe, it, expect } from 'vitest';
import {
  nextStatusOnScoreChange,
  canConfirmDoc,
  canConfirmFinal,
} from '../src/recruit/status';
import { parseCsv, mapRowToApplicant, detectDuplicates } from '../src/recruit/csv';
import { validateScore } from '../src/recruit/scores';
import { aggregateScoresByApplicant } from '../src/recruit/aggregate';

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
    expect(rows[0][0]).toBe('홍길동');
    expect(rows[0][2]).toBe('안녕하세요.\n저는 "동물"을 사랑합니다.');
    expect(rows[1][0]).toBe('김철수');
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
    expect(uniqueApplicants[0].name).toBe('홍길동');
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

    expect(agg['app1'].docScoreAvg).toBe(8.0);
    expect(agg['app1'].docScoreMin).toBe(7.0);
    expect(agg['app1'].docScoreMax).toBe(9.0);
    expect(agg['app1'].docScorerCount).toBe(3);
    expect(agg['app1'].isDocSampleDeficient).toBe(false);

    expect(agg['app2'].docScoreAvg).toBe(6.0);
    expect(agg['app2'].docScorerCount).toBe(1);
    expect(agg['app2'].isDocSampleDeficient).toBe(true); // < 3명
  });
});
