import { describe, it, expect } from 'vitest';
import { matchesTeamFilter, effectiveTeamOf } from './team-filter';

const T1 = '1팀 - 파주일산';
const T2 = '2팀 - 서울';

describe('모집 팀 필터', () => {
  it('배정 전에는 1지망을 기준으로 나눈다', () => {
    const app = { wishTeam1: T1, wishTeam2: T2 };
    expect(matchesTeamFilter(app, T1)).toBe(true);
    // 2지망까지 걸리면 2팀을 골라도 1팀 지원자가 딸려 나와 필터가 안 먹는 것처럼 보인다.
    expect(matchesTeamFilter(app, T2)).toBe(false);
  });

  it('회장단이 팀을 배정했으면 배정팀을 따른다', () => {
    const app = { assignedTeam: T2, wishTeam1: T1 };
    expect(matchesTeamFilter(app, T2)).toBe(true);
    expect(matchesTeamFilter(app, T1)).toBe(false);
    expect(effectiveTeamOf(app)).toBe(T2);
  });

  it('전체를 고르면 팀이 없는 지원자도 나온다', () => {
    expect(matchesTeamFilter({}, 'ALL')).toBe(true);
    expect(matchesTeamFilter({ wishTeam1: T1 }, 'ALL')).toBe(true);
  });

  it('팀이 비어 있는 지원자는 특정 팀 필터에 걸리지 않는다', () => {
    expect(matchesTeamFilter({}, T1)).toBe(false);
    expect(matchesTeamFilter({ assignedTeam: null, wishTeam1: null }, T1)).toBe(false);
    expect(effectiveTeamOf({})).toBeNull();
  });

  it('한 지원자는 한 팀 목록에만 나온다', () => {
    const app = { wishTeam1: T1, wishTeam2: T2 };
    const hits = [T1, T2].filter((t) => matchesTeamFilter(app, t));
    expect(hits).toEqual([T1]);
  });
});
