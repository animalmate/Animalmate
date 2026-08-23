import { describe, it, expect } from 'vitest';
import {
  isUnderReview,
  sortForReview,
  groupApplicantsByTeam,
  UNASSIGNED_TEAM_LABEL,
} from './review-list';

const app = (over: Partial<Parameters<typeof isUnderReview>[0]> = {}) => ({
  id: 'a',
  name: '가나다',
  status: 'interview_done',
  slotId: 'slot-1',
  ...over,
});

describe('isUnderReview — 최종 검토 화면에 서는 사람', () => {
  it('면접에 배정됐고 불참이 아니면 대상이다', () => {
    expect(isUnderReview(app())).toBe(true);
  });

  it('배정되지 않았으면 대상이 아니다', () => {
    // 서류에 붙었지만 면접 자리를 못 받은 사람. 볼 면접 점수 자체가 없다.
    expect(isUnderReview(app({ status: 'doc_pass', slotId: null }))).toBe(false);
  });

  it('면접 불참은 대상이 아니다', () => {
    expect(isUnderReview(app({ status: 'interview_noshow' }))).toBe(false);
  });

  it('최종 결정이 끝난 사람도 계속 대상이다', () => {
    // 확정하는 순간 목록이 비면 "왜 그렇게 정했더라"를 되짚을 자리가 사라진다.
    expect(isUnderReview(app({ status: 'final_pass' }))).toBe(true);
    expect(isUnderReview(app({ status: 'final_fail' }))).toBe(true);
  });

  it('서류에서 떨어진 사람은 배정 흔적이 남아 있어도 대상이 아니다', () => {
    expect(isUnderReview(app({ status: 'doc_fail', slotId: null }))).toBe(false);
  });
});

describe('sortForReview — 면접 평균 내림차순', () => {
  const scores = {
    high: { docScoreAvg: 5, interviewScoreAvg: 9 },
    mid: { docScoreAvg: 9, interviewScoreAvg: 7 },
    none: { docScoreAvg: 10, interviewScoreAvg: null },
  };

  it('면접 평균이 높은 사람이 앞에 온다', () => {
    const sorted = sortForReview(
      [app({ id: 'mid', name: '나' }), app({ id: 'high', name: '가' })],
      scores
    );
    expect(sorted.map((a) => a.id)).toEqual(['high', 'mid']);
  });

  it('면접 점수가 없는 사람은 맨 뒤로 간다 — 0점과 같은 자리에 세우지 않는다', () => {
    const zero = { docScoreAvg: null, interviewScoreAvg: 0 };
    const sorted = sortForReview(
      [app({ id: 'none' }), app({ id: 'zero' })],
      { ...scores, zero }
    );
    expect(sorted.map((a) => a.id)).toEqual(['zero', 'none']);
  });

  it('면접 평균이 같으면 서류 평균으로, 그것도 같으면 이름순으로 가른다', () => {
    const tie = {
      a: { docScoreAvg: 7, interviewScoreAvg: 8 },
      b: { docScoreAvg: 9, interviewScoreAvg: 8 },
      c: { docScoreAvg: 9, interviewScoreAvg: 8 },
    };
    const sorted = sortForReview(
      [
        app({ id: 'a', name: '가' }),
        app({ id: 'c', name: '하' }),
        app({ id: 'b', name: '나' }),
      ],
      tie
    );
    expect(sorted.map((a) => a.id)).toEqual(['b', 'c', 'a']);
  });

  it('원본 배열을 건드리지 않는다', () => {
    const input = [app({ id: 'mid' }), app({ id: 'high' })];
    sortForReview(input, scores);
    expect(input.map((a) => a.id)).toEqual(['mid', 'high']);
  });
});

describe('groupApplicantsByTeam — 팀별 묶음', () => {
  it('배정팀이 있으면 배정팀, 없으면 1지망으로 묶는다', () => {
    const groups = groupApplicantsByTeam(
      [
        app({ id: '1', assignedTeam: '2팀', wishTeam1: '1팀' }),
        app({ id: '2', wishTeam1: '1팀' }),
      ],
      ['1팀', '2팀']
    );
    expect(groups.map((g) => [g.team, g.applicants.map((a) => a.id)])).toEqual([
      ['1팀', ['2']],
      ['2팀', ['1']],
    ]);
  });

  it('묶음 순서는 기수 설정의 팀 목록 순서를 따른다', () => {
    const groups = groupApplicantsByTeam(
      [app({ id: '1', wishTeam1: '3팀' }), app({ id: '2', wishTeam1: '1팀' })],
      ['1팀', '2팀', '3팀']
    );
    expect(groups.map((g) => g.team)).toEqual(['1팀', '3팀']);
  });

  it('아무도 없는 팀은 제목만 남기지 않는다', () => {
    const groups = groupApplicantsByTeam([app({ id: '1', wishTeam1: '1팀' })], ['1팀', '2팀']);
    expect(groups).toHaveLength(1);
  });

  it('묶음 안에서는 넘겨받은 순서를 그대로 지킨다', () => {
    const groups = groupApplicantsByTeam(
      [
        app({ id: 'first', wishTeam1: '1팀' }),
        app({ id: 'second', wishTeam1: '1팀' }),
        app({ id: 'third', wishTeam1: '1팀' }),
      ],
      ['1팀']
    );
    expect(groups[0]!.applicants.map((a) => a.id)).toEqual(['first', 'second', 'third']);
  });

  it('팀 목록에 없는 팀 이름도 버리지 않고 뒤에 붙인다', () => {
    // 옛 기수 값이나 지역이 붙어 남은 값. 사람이 사라지는 것보다는 뒤에 서는 편이 낫다.
    const groups = groupApplicantsByTeam(
      [app({ id: '1', wishTeam1: '옛날팀' }), app({ id: '2', wishTeam1: '1팀' })],
      ['1팀']
    );
    expect(groups.map((g) => g.team)).toEqual(['1팀', '옛날팀']);
  });

  it('팀을 모르는 사람은 맨 끝 팀 미지정으로 모은다', () => {
    const groups = groupApplicantsByTeam(
      [
        app({ id: '1', wishTeam1: null }),
        app({ id: '2', wishTeam1: '1팀' }),
        app({ id: '3', assignedTeam: '', wishTeam1: '' }),
      ],
      ['1팀']
    );
    expect(groups.map((g) => g.team)).toEqual(['1팀', UNASSIGNED_TEAM_LABEL]);
    expect(groups[1]!.applicants.map((a) => a.id)).toEqual(['1', '3']);
  });

  it('팀 목록이 비어 있어도 나온 순서대로 묶는다', () => {
    const groups = groupApplicantsByTeam([
      app({ id: '1', wishTeam1: '2팀' }),
      app({ id: '2', wishTeam1: '1팀' }),
    ]);
    expect(groups.map((g) => g.team)).toEqual(['2팀', '1팀']);
  });
});
