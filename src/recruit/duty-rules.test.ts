import { describe, it, expect } from 'vitest';
import {
  DUTY_ALL,
  DEFAULT_DUTY_ROLES,
  resolveDutyRoles,
  isValidDuty,
  buildDutyRows,
  findDoubleBookedDuties,
  dutyRosterToTsv,
} from './duty-rules';

describe('대기실 업무 이름', () => {
  it('설정이 없으면 기본 구성을 쓴다', () => {
    expect(resolveDutyRoles(null)).toEqual([...DEFAULT_DUTY_ROLES]);
    expect(resolveDutyRoles(undefined)).toEqual([...DEFAULT_DUTY_ROLES]);
    expect(resolveDutyRoles([])).toEqual([...DEFAULT_DUTY_ROLES]);
  });

  it('공백만 있는 이름은 버린다', () => {
    expect(resolveDutyRoles(['  명단 체크 ', '', '   '])).toEqual(['명단 체크']);
  });

  it('이름이 겹치면 하나만 남긴다', () => {
    // UNIQUE(cohort, starts_at, duty) 라 이름이 같으면 한 칸이 다른 칸을 덮어쓴다.
    expect(resolveDutyRoles(['안내', '안내', '인솔'])).toEqual(['안내', '인솔']);
  });

  it('문자열이 아닌 값은 걸러낸다', () => {
    expect(resolveDutyRoles([1, '안내', null, { a: 1 }])).toEqual(['안내']);
  });

  it('설정에 없는 업무는 저장을 막는다', () => {
    const roles = ['안내', '인솔'];
    expect(isValidDuty('안내', roles)).toBe(true);
    expect(isValidDuty('아무거나', roles)).toBe(false);
    // 전원 공지 줄은 역할 목록에 없어도 허용한다.
    expect(isValidDuty(DUTY_ALL, roles)).toBe(true);
  });
});

describe('대기실 배정 줄 만들기', () => {
  const T1 = Date.parse('2026-08-15T01:00:00Z');
  const T2 = Date.parse('2026-08-15T01:30:00Z');
  const T3 = Date.parse('2026-08-15T02:00:00Z');

  it('배정이 없는 시간대도 줄을 만든다 — 면접 표와 줄 수가 같아야 한다', () => {
    const rows = buildDutyRows({ startTimes: [T1, T2, T3], assignments: [] });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.allNote === null && Object.keys(r.byDuty).length === 0)).toBe(true);
  });

  it('역할별로 배정된 사람을 넣는다', () => {
    const rows = buildDutyRows({
      startTimes: [T1, T2],
      assignments: [
        { startsAt: new Date(T1).toISOString(), duty: '안내', userId: 'u1', userName: '김유빈', note: null },
        { startsAt: new Date(T1).toISOString(), duty: '인솔', userId: 'u2', userName: '양지원', note: null },
      ],
    });
    expect(rows[0]!.byDuty['안내']).toEqual({ userId: 'u1', userName: '김유빈' });
    expect(rows[0]!.byDuty['인솔']!.userName).toBe('양지원');
    expect(rows[1]!.byDuty).toEqual({});
  });

  it('전원 공지 줄은 역할 칸 대신 문구로 담는다', () => {
    const rows = buildDutyRows({
      startTimes: [T1],
      assignments: [
        { startsAt: new Date(T1).toISOString(), duty: DUTY_ALL, userId: null, note: '전원 면접실 B 정비' },
      ],
    });
    expect(rows[0]!.allNote).toBe('전원 면접실 B 정비');
  });

  it('빈 문구는 전원 공지로 치지 않는다', () => {
    const rows = buildDutyRows({
      startTimes: [T1],
      assignments: [{ startsAt: new Date(T1).toISOString(), duty: DUTY_ALL, userId: null, note: '   ' }],
    });
    expect(rows[0]!.allNote).toBeNull();
  });

  it('면접 슬롯이 지워져 시간축에 없는 배정도 줄로 남긴다', () => {
    // 조용히 사라지면 그 시간에 대기실이 빈 줄 모르고 넘어간다.
    const rows = buildDutyRows({
      startTimes: [T1],
      assignments: [
        { startsAt: new Date(T3).toISOString(), duty: '안내', userId: 'u1', userName: '김유빈', note: null },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[1]!.startsAtMs).toBe(T3);
  });

  it('줄은 시간 순으로 준다', () => {
    const rows = buildDutyRows({ startTimes: [T3, T1, T2], assignments: [] });
    expect(rows.map((r) => r.startsAtMs)).toEqual([T1, T2, T3]);
  });

  it('깨진 시각의 배정은 버린다', () => {
    const rows = buildDutyRows({
      startTimes: [T1],
      assignments: [{ startsAt: 'not-a-date', duty: '안내', userId: 'u1', note: null }],
    });
    expect(rows).toHaveLength(1);
  });
});

describe('한 사람 이중 배정', () => {
  const T1 = Date.parse('2026-08-15T01:00:00Z');

  it('같은 시간대에 두 업무를 맡으면 잡아낸다 — 몸이 하나뿐이다', () => {
    const rows = buildDutyRows({
      startTimes: [T1],
      assignments: [
        { startsAt: new Date(T1).toISOString(), duty: '안내', userId: 'u1', userName: '김유빈', note: null },
        { startsAt: new Date(T1).toISOString(), duty: '인솔', userId: 'u1', userName: '김유빈', note: null },
      ],
    });
    expect(findDoubleBookedDuties(rows)).toEqual([{ startsAtMs: T1, userName: '김유빈' }]);
  });

  it('시간대가 다르면 같은 사람이어도 괜찮다', () => {
    const T2 = Date.parse('2026-08-15T01:30:00Z');
    const rows = buildDutyRows({
      startTimes: [T1, T2],
      assignments: [
        { startsAt: new Date(T1).toISOString(), duty: '안내', userId: 'u1', userName: '김유빈', note: null },
        { startsAt: new Date(T2).toISOString(), duty: '인솔', userId: 'u1', userName: '김유빈', note: null },
      ],
    });
    expect(findDoubleBookedDuties(rows)).toEqual([]);
  });

  it('빈 칸은 겹침으로 세지 않는다', () => {
    const rows = buildDutyRows({
      startTimes: [T1],
      assignments: [
        { startsAt: new Date(T1).toISOString(), duty: '안내', userId: null, note: null },
        { startsAt: new Date(T1).toISOString(), duty: '인솔', userId: null, note: null },
      ],
    });
    expect(findDoubleBookedDuties(rows)).toEqual([]);
  });
});

describe('대기실 표 붙여넣기용 텍스트', () => {
  const T1 = Date.parse('2026-08-15T01:00:00Z');
  const T2 = Date.parse('2026-08-15T01:30:00Z');
  const label = (ms: number) => (ms === T1 ? '10:00 ~ 10:30' : '10:30 ~ 11:00');
  const roles = ['명단 체크', '대기실 안내', '인솔'];

  it('역할을 머리글로 두고 배정된 이름을 채운다', () => {
    const rows = buildDutyRows({
      startTimes: [T1],
      assignments: [
        { startsAt: new Date(T1).toISOString(), duty: '명단 체크', userId: 'u1', userName: '김유빈', note: null },
        { startsAt: new Date(T1).toISOString(), duty: '인솔', userId: 'u2', userName: '양지원', note: null },
      ],
    });
    const lines = dutyRosterToTsv(roles, rows, label).split('\n');
    expect(lines[0]!.split('\t')).toEqual(['대기실', '명단 체크', '대기실 안내', '인솔']);
    // 배정 없는 칸도 자리를 지켜야 엑셀에서 열이 밀리지 않는다.
    expect(lines[1]!.split('\t')).toEqual(['10:00 ~ 10:30', '김유빈', '', '양지원']);
  });

  it('전원 공지 줄은 첫 칸에 문구를 넣고 나머지를 비운다 — TSV 에는 셀 병합이 없다', () => {
    const rows = buildDutyRows({
      startTimes: [T1, T2],
      assignments: [
        { startsAt: new Date(T1).toISOString(), duty: DUTY_ALL, userId: null, note: '전원 면접실 정비' },
      ],
    });
    const lines = dutyRosterToTsv(roles, rows, label).split('\n');
    expect(lines[1]!.split('\t')).toEqual(['10:00 ~ 10:30', '전원 면접실 정비', '', '']);
  });

  it('줄이 없으면 빈 문자열 — 공지에 빈 표를 붙이지 않는다', () => {
    expect(dutyRosterToTsv(roles, [], label)).toBe('');
  });
});
