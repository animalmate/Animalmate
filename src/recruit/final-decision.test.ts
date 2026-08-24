import { describe, it, expect } from 'vitest';
import {
  decideFinalOutcome,
  decideFinalOutcomes,
  summarizeFinalDecisions,
  groupPassByFinalTeam,
  type FinalDecidable,
} from './final-decision';

const app = (over: Partial<FinalDecidable> = {}): FinalDecidable => ({
  id: 'a',
  ...over,
});

describe('decideFinalOutcome — 표시 하나를 결과로 바꾼다', () => {
  it('탈락 표시는 fail 이고 팀은 안 본다', () => {
    const d = decideFinalOutcome(app({ reviewMark: 'drop', assignedTeam: '2팀' }), 5);
    expect(d.outcome).toBe('fail');
    expect(d.finalTeam).toBeNull();
  });

  it('다른 팀 표시 + 갈 팀이 있으면 pass, 최종 팀은 그 팀이다', () => {
    const d = decideFinalOutcome(app({ reviewMark: 'move', reviewMoveTeam: '4팀', assignedTeam: '5팀' }), 5);
    expect(d.outcome).toBe('pass');
    expect(d.finalTeam).toBe('4팀');
  });

  it('다른 팀 표시인데 갈 팀을 안 골랐으면 move_team_unset 이다', () => {
    const d = decideFinalOutcome(app({ reviewMark: 'move', reviewMoveTeam: null }), 5);
    expect(d.outcome).toBe('move_team_unset');
    expect(d.finalTeam).toBeNull();
  });

  it('갈 팀이 빈 문자열이어도 move_team_unset 이다', () => {
    const d = decideFinalOutcome(app({ reviewMark: 'move', reviewMoveTeam: '   ' }), 5);
    expect(d.outcome).toBe('move_team_unset');
  });

  it('표시가 없는데 아무도 채점하지 않았으면 unscored 다', () => {
    const d = decideFinalOutcome(app({ assignedTeam: '2팀' }), 0);
    expect(d.outcome).toBe('unscored');
    expect(d.finalTeam).toBeNull();
  });

  it('표시가 없고 채점됐으면 pass, 최종 팀은 배정팀이다', () => {
    const d = decideFinalOutcome(app({ assignedTeam: '2팀', wishTeam1: '1팀' }), 3);
    expect(d.outcome).toBe('pass');
    expect(d.finalTeam).toBe('2팀');
  });

  it('배정팀이 없으면 1지망으로 최종 팀을 정한다', () => {
    const d = decideFinalOutcome(app({ assignedTeam: null, wishTeam1: '3팀' }), 1);
    expect(d.outcome).toBe('pass');
    expect(d.finalTeam).toBe('3팀');
  });

  it('배정팀도 1지망도 없으면 최종 팀은 null 이다', () => {
    const d = decideFinalOutcome(app({ assignedTeam: null, wishTeam1: null }), 1);
    expect(d.outcome).toBe('pass');
    expect(d.finalTeam).toBeNull();
  });
});

describe('decideFinalOutcomes — 여럿을 한 번에', () => {
  it('사람마다 자기 채점 인원 수로 계산한다', () => {
    const applicants = [app({ id: 'a', assignedTeam: '1팀' }), app({ id: 'b', assignedTeam: '2팀' })];
    const counts: Record<string, number> = { a: 0, b: 2 };
    const results = decideFinalOutcomes(applicants, (id) => counts[id] ?? 0);
    expect(results.map((r) => r.outcome)).toEqual(['unscored', 'pass']);
  });
});

describe('summarizeFinalDecisions — 결과별로 나눈다', () => {
  it('네 종류로 정확히 갈린다', () => {
    const decisions = decideFinalOutcomes(
      [
        app({ id: 'fail', reviewMark: 'drop' }),
        app({ id: 'pass', assignedTeam: '1팀' }),
        app({ id: 'unscored' }),
        app({ id: 'unset', reviewMark: 'move' }),
      ],
      (id) => (id === 'pass' ? 3 : 0)
    );
    const s = summarizeFinalDecisions(decisions);
    expect(s.fail.map((d) => d.applicant.id)).toEqual(['fail']);
    expect(s.pass.map((d) => d.applicant.id)).toEqual(['pass']);
    expect(s.unscored.map((d) => d.applicant.id)).toEqual(['unscored']);
    expect(s.moveTeamUnset.map((d) => d.applicant.id)).toEqual(['unset']);
  });
});

describe('groupPassByFinalTeam — 합격자를 팀 기준으로 묶는다', () => {
  it('같은 팀으로 가는 사람을 한 목록에 모은다', () => {
    const decisions = decideFinalOutcomes(
      [
        app({ id: 'a', assignedTeam: '1팀' }),
        app({ id: 'b', reviewMark: 'move', reviewMoveTeam: '1팀' }),
        app({ id: 'c', assignedTeam: '2팀' }),
      ],
      () => 3
    );
    const grouped = groupPassByFinalTeam(summarizeFinalDecisions(decisions).pass);
    expect(grouped.get('1팀')).toEqual(['a', 'b']);
    expect(grouped.get('2팀')).toEqual(['c']);
    expect(grouped.size).toBe(2);
  });

  it('최종 팀이 없는 합격자는 어느 묶음에도 안 들어간다', () => {
    const decisions = [decideFinalOutcome(app({ id: 'a', assignedTeam: null, wishTeam1: null }), 3)];
    const grouped = groupPassByFinalTeam(decisions);
    expect(grouped.size).toBe(0);
  });

  it('fail·unscored·move_team_unset 은 애초에 pass 목록에 없으니 섞이지 않는다', () => {
    const decisions = decideFinalOutcomes(
      [app({ id: 'fail', reviewMark: 'drop' }), app({ id: 'unset', reviewMark: 'move' })],
      () => 0
    );
    const grouped = groupPassByFinalTeam(summarizeFinalDecisions(decisions).pass);
    expect(grouped.size).toBe(0);
  });
});
