import { describe, it, expect } from 'vitest';
import { shortTeamName } from './team-name';

describe('팀 이름 손질', () => {
  it('지역·집결지 꼬리를 떼고 팀 이름만 남긴다', () => {
    expect(shortTeamName('1팀 - 강남(집결지 강남역)')).toBe('1팀');
    expect(shortTeamName('2팀 — 성북 (집결지: 성신여대입구역)')).toBe('2팀');
    expect(shortTeamName('3팀(노원)')).toBe('3팀');
    expect(shortTeamName('4팀-도봉')).toBe('4팀');
  });

  it('구분자가 없으면 그대로 둔다', () => {
    expect(shortTeamName('1팀')).toBe('1팀');
    expect(shortTeamName('봉사 1팀')).toBe('봉사 1팀');
    // 2순위 추가 선택지로 쓰이던 문구가 잘리면 안 된다.
    expect(shortTeamName('2순위 팀 배치 희망하지 않음')).toBe('2순위 팀 배치 희망하지 않음');
  });

  it('빈 값은 null 이다(배정 전 지원자)', () => {
    expect(shortTeamName(null)).toBeNull();
    expect(shortTeamName(undefined)).toBeNull();
    expect(shortTeamName('  ')).toBeNull();
  });

  it('구분자로 시작해 남는 게 없으면 원문을 쓴다', () => {
    expect(shortTeamName(' - 강남')).toBe('- 강남');
    expect(shortTeamName('(미정)')).toBe('(미정)');
  });
});
