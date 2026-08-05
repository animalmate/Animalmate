import { describe, it, expect } from 'vitest';
import {
  buildStaffTimetable,
  panelOrder,
  cellsMissingInterviewers,
  staffTimetableToTsv,
  type StaffTimetableSlot,
} from './staff-timetable';
import { buildDutyRows, DUTY_ALL } from './duty-rules';

// 2026-08-15 10:00 KST = 01:00 UTC
const at = (utc: string) => `2026-08-15T${utc}:00Z`;
const made = (n: number) => `2026-08-01T0${n}:00:00Z`;

const slot = (over: Partial<StaffTimetableSlot> & { id: string; startsAt: string }): StaffTimetableSlot => ({
  durationMin: 30,
  venue: '학생회관 201호',
  createdAt: made(1),
  ...over,
});

const build = (slots: StaffTimetableSlot[], interviewersBySlot: Record<string, string[]> = {}, dutyRows = []) =>
  buildStaffTimetable({ slots, interviewersBySlot, dutyRows });

describe('운영진 시간표 — 조가 열, 시각이 행', () => {
  it('조를 열로 세우고 칸에 면접관을 넣는다', () => {
    const [day] = build(
      [
        slot({ id: 'a1', panel: 'A조', startsAt: at('01:00'), createdAt: made(1) }),
        slot({ id: 'b1', panel: 'B조', startsAt: at('01:00'), createdAt: made(2) }),
        slot({ id: 'a2', panel: 'A조', startsAt: at('01:30'), createdAt: made(1) }),
      ],
      { a1: ['가가가', '나나나'], b1: ['다다다'], a2: ['가가가'] }
    );

    expect(day!.panels).toEqual(['A조', 'B조']);
    expect(day!.rows.map((r) => r.timeLabel)).toEqual(['10:00 ~ 10:30', '10:30 ~ 11:00']);
    expect(day!.rows[0]!.byPanel['A조']!.interviewers).toEqual(['가가가', '나나나']);
    expect(day!.rows[0]!.byPanel['B조']!.interviewers).toEqual(['다다다']);
  });

  it('조 개수는 고정이 아니다 — 대면 3개·비대면 0개도 그대로 선다', () => {
    // 지난 기수가 A조·B조·비대면 파견이었다고 코드가 그것을 전제하면 안 된다(결정 95).
    const [day] = build([
      slot({ id: 'a', panel: 'A조', startsAt: at('01:00'), createdAt: made(1) }),
      slot({ id: 'b', panel: 'B조', startsAt: at('01:00'), createdAt: made(2) }),
      slot({ id: 'c', panel: 'C조', startsAt: at('01:00'), createdAt: made(3) }),
    ]);
    expect(day!.panels).toEqual(['A조', 'B조', 'C조']);
  });

  it('조가 비운 시간대는 칸을 만들지 않는다(줄은 남는다)', () => {
    // A조가 첫 30분을 면접실 정비로 비우는 실제 운영 모양.
    const [day] = build([
      slot({ id: 'b1', panel: 'B조', startsAt: at('01:00'), createdAt: made(2) }),
      slot({ id: 'a1', panel: 'A조', startsAt: at('01:30'), createdAt: made(1) }),
      slot({ id: 'b2', panel: 'B조', startsAt: at('01:30'), createdAt: made(2) }),
    ]);
    expect(day!.rows).toHaveLength(2);
    expect(day!.rows[0]!.byPanel['A조']).toBeUndefined();
    expect(day!.rows[0]!.byPanel['B조']).toBeDefined();
    // 첫 시간대를 비웠다고 A조가 뒤로 밀리면 안 된다 — 열 순서는 만든 순서다.
    expect(day!.panels).toEqual(['A조', 'B조']);
  });

  it('장소·링크는 조마다 한 번만 모은다', () => {
    const [day] = build([
      slot({ id: 'a', panel: 'A조', startsAt: at('01:00'), venue: '학생회관 201호' }),
      slot({ id: 'r', panel: '비대면 파견', startsAt: at('01:00'), venue: null, isRemote: true, link: 'https://zoom.us/j/1', createdAt: made(2) }),
    ]);
    expect(day!.placeByPanel['A조']).toBe('학생회관 201호');
    expect(day!.placeByPanel['비대면 파견']).toBe('비대면');
    expect(day!.linkByPanel['비대면 파견']).toBe('https://zoom.us/j/1');
  });

  it('날짜가 다르면 표를 나누고 날짜순으로 준다', () => {
    const days = build([
      slot({ id: 'b', panel: 'A조', startsAt: '2026-10-02T01:00:00Z' }),
      slot({ id: 'a', panel: 'A조', startsAt: '2026-02-02T01:00:00Z' }),
    ]);
    expect(days).toHaveLength(2);
    // 표시용 라벨('10. 2.')로 나누면 10월이 2월 앞에 온다 — 정렬은 YYYY-MM-DD 키로 한다.
    expect(days[0]!.rows[0]!.startsAtMs).toBeLessThan(days[1]!.rows[0]!.startsAtMs);
  });

  it('조 컬럼이 없는 옛 슬롯은 장소로 부른다', () => {
    // 0026 이전 슬롯이 운영 DB 에 남아 있다. 빈 열은 '배정 없음'과 구별되지 않는다.
    const [day] = build([slot({ id: 'old', panel: null, startsAt: at('01:00'), venue: '동아리방' })]);
    expect(day!.panels).toEqual(['동아리방']);
  });

  it('같은 시각을 나눠 쓰는 옛 슬롯은 순번으로 부른다', () => {
    const [day] = build([
      slot({ id: 'o1', panel: null, startsAt: at('01:00'), createdAt: made(1) }),
      slot({ id: 'o2', panel: null, startsAt: at('01:00'), createdAt: made(2) }),
    ]);
    expect(day!.panels).toEqual(['1조', '2조']);
  });
});

describe('대기실 업무를 같은 표에 얹는다', () => {
  const slots = [
    slot({ id: 'a1', panel: 'A조', startsAt: at('01:00') }),
    slot({ id: 'a2', panel: 'A조', startsAt: at('01:30') }),
  ];
  const startTimes = [new Date(at('01:00')).getTime(), new Date(at('01:30')).getTime()];

  it('면접관이 아닌 운영진도 같은 줄에서 읽힌다', () => {
    const dutyRows = buildDutyRows({
      startTimes,
      assignments: [
        { startsAt: at('01:00'), duty: '대기실 안내', userId: 'u1', note: null, userName: '라라라' },
        { startsAt: at('01:30'), duty: DUTY_ALL, userId: null, note: '전원 면접실 정비', userName: null },
      ],
    });
    const [day] = buildStaffTimetable({ slots, interviewersBySlot: { a1: ['가가가'] }, dutyRows });

    expect(day!.rows[0]!.duties['대기실 안내']).toBe('라라라');
    expect(day!.rows[1]!.allNote).toBe('전원 면접실 정비');
  });

  it('면접 슬롯이 없는 시간대의 배정도 줄로 남긴다', () => {
    // 슬롯을 지웠다고 대기실 배정이 조용히 사라지면, 그 시간에 대기실이 빈 줄 모르고 넘어간다.
    const dutyRows = buildDutyRows({
      startTimes,
      assignments: [{ startsAt: at('02:00'), duty: '대기실 안내', userId: 'u1', note: null, userName: '라라라' }],
    });
    const [day] = buildStaffTimetable({ slots, interviewersBySlot: {}, dutyRows });
    expect(day!.rows).toHaveLength(3);
    expect(day!.rows[2]!.duties['대기실 안내']).toBe('라라라');
    expect(day!.rows[2]!.byPanel).toEqual({});
  });
});

describe('panelOrder — 만든 순서', () => {
  const order = (rows: { panel: string; createdAt?: string | null }[]) =>
    panelOrder(
      rows,
      (r) => r.panel,
      (r) => r.createdAt
    );

  it('이름순이 아니라 만든 순서다', () => {
    // 이름순으로 정렬하면 한글이 영문 앞에 오는 규칙 탓에 '비대면 파견'이 A조 앞에 선다.
    expect(order([{ panel: '비대면 파견', createdAt: made(3) }, { panel: 'A조', createdAt: made(1) }])).toEqual([
      'A조',
      '비대면 파견',
    ]);
  });

  it('같은 순간에 만든 조는 이름으로 갈라 순서를 고정한다', () => {
    // 순서가 흔들리면 새로고침할 때마다 열이 자리를 바꾼다.
    expect(order([{ panel: 'B조', createdAt: made(1) }, { panel: 'A조', createdAt: made(1) }])).toEqual(['A조', 'B조']);
  });

  it('createdAt 이 없으면 순서를 주장하지 않고 뒤로 민다', () => {
    expect(order([{ panel: '조없음', createdAt: null }, { panel: 'A조', createdAt: made(1) }])).toEqual([
      'A조',
      '조없음',
    ]);
  });
});

describe('배정 점검·복사', () => {
  it('면접관이 아직 없는 칸을 센다', () => {
    const days = build(
      [
        slot({ id: 'a1', panel: 'A조', startsAt: at('01:00') }),
        slot({ id: 'a2', panel: 'A조', startsAt: at('01:30') }),
      ],
      { a1: ['가가가'] }
    );
    expect(cellsMissingInterviewers(days)).toBe(1);
  });

  it('전원 공지가 그 시간 면접관을 지우지 않는다', () => {
    // A조만 첫 30분을 비우고 B조는 면접 중인 실제 모양. 줄을 통째로 공지로 덮으면
    // "그 시간 B조는 나나나"가 사라진다 — 둘 다 참인 사실이라 한쪽을 버릴 수 없다.
    const t0 = new Date(at('01:00')).getTime();
    const dutyRows = buildDutyRows({
      startTimes: [t0],
      assignments: [{ startsAt: at('01:00'), duty: DUTY_ALL, userId: null, note: '전원 면접실 정비', userName: null }],
    });
    const days = buildStaffTimetable({
      slots: [slot({ id: 'b1', panel: 'B조', startsAt: at('01:00') })],
      interviewersBySlot: { b1: ['나나나'] },
      dutyRows,
    });

    const lines = staffTimetableToTsv(days, ['대기실 안내']).split('\n');
    expect(lines[1]).toBe('시간\tB조\t전원 공지');
    expect(lines[2]).toBe('10:00 ~ 10:30\t나나나\t전원 면접실 정비');
  });

  it('탭 구분 표로 뽑는다 — 배정된 업무만 열로 세운다', () => {
    const startTimes = [new Date(at('01:00')).getTime()];
    const dutyRows = buildDutyRows({
      startTimes,
      assignments: [{ startsAt: at('01:00'), duty: '대기실 안내', userId: 'u1', note: null, userName: '라라라' }],
    });
    const days = buildStaffTimetable({
      slots: [slot({ id: 'a1', panel: 'A조', startsAt: at('01:00') })],
      interviewersBySlot: { a1: ['가가가', '나나나'] },
      dutyRows,
    });

    const tsv = staffTimetableToTsv(days, ['대기실 안내', '면접장 인솔a']);
    const lines = tsv.split('\n');
    // '면접장 인솔a' 는 아무도 안 맡았으므로 열을 만들지 않는다(빈 열이 늘면 표가 옆으로 샌다).
    expect(lines[1]).toBe('시간\tA조\t대기실 안내');
    expect(lines[2]).toBe('10:00 ~ 10:30\t가가가·나나나\t라라라');
  });
});
