import { describe, it, expect } from 'vitest';
import { buildTimetable, timetableToTsv, slotsMissingInterviewers, type TimetableSlot } from './timetable';
import { slotPlaceLabel } from './display';

const place = (s: TimetableSlot) => slotPlaceLabel(s);

// 2026-08-15 10:00 KST = 01:00 UTC
const at = (utc: string) => `2026-08-15T${utc}:00Z`;

const SLOTS: TimetableSlot[] = [
  { id: 'a', startsAt: at('01:00'), durationMin: 30, venue: '학생회관 201호' },
  { id: 'b', startsAt: at('01:00'), durationMin: 30, venue: '동아리방' },
  { id: 'c', startsAt: at('01:30'), durationMin: 30, venue: '학생회관 201호' },
  { id: 'd', startsAt: at('02:00'), durationMin: 30, venue: null, isRemote: true, link: 'https://x.invalid' },
];

const APPS = {
  a: [{ name: '가가가', team: '봉사 1팀' }],
  b: [{ name: '나나나', team: '봉사 2팀' }],
  c: [{ name: '다다다', team: '봉사 1팀' }],
  d: [{ name: '라라라', team: '봉사 3팀' }],
};
const STAFF = { a: ['이운영'], b: ['최운영'], c: [], d: ['정운영'] };

describe('면접 시간표 격자', () => {
  it('행=시각, 열=장소로 접는다', () => {
    const [day] = buildTimetable({
      slots: SLOTS,
      applicantsBySlot: APPS,
      interviewersBySlot: STAFF,
      placeLabel: place,
    });
    expect(day!.places).toEqual(['동아리방', '비대면', '학생회관 201호']);
    expect(day!.rows.map((r) => r.timeLabel)).toEqual(['10:00', '10:30', '11:00']);
  });

  it('보는 사람의 시간대와 무관하게 한국 시간으로 찍는다', () => {
    // 공지에 붙일 표라 기계마다 시각이 달라지면 안 된다.
    const [day] = buildTimetable({
      slots: [{ id: 'x', startsAt: '2026-08-15T01:00:00Z' }],
      applicantsBySlot: {},
      interviewersBySlot: {},
      placeLabel: place,
    });
    expect(day!.rows[0]!.timeLabel).toBe('10:00');
  });

  it('빈 칸은 빈 배열이고 각 행의 길이가 열 수와 같다', () => {
    const [day] = buildTimetable({
      slots: SLOTS,
      applicantsBySlot: APPS,
      interviewersBySlot: STAFF,
      placeLabel: place,
    });
    for (const row of day!.rows) expect(row.cells.length).toBe(day!.places.length);
    const tenThirty = day!.rows.find((r) => r.timeLabel === '10:30')!;
    expect(tenThirty.cells[day!.places.indexOf('동아리방')]).toEqual([]);
  });

  it('날짜가 여럿이면 날짜별로 나누고 순서대로 준다', () => {
    const days = buildTimetable({
      slots: [
        { id: 'later', startsAt: '2026-08-16T01:00:00Z', venue: 'A' },
        { id: 'earlier', startsAt: '2026-08-15T01:00:00Z', venue: 'A' },
      ],
      applicantsBySlot: {},
      interviewersBySlot: {},
      placeLabel: place,
    });
    expect(days).toHaveLength(2);
    expect(days[0]!.dateLabel).toContain('15');
    expect(days[1]!.dateLabel).toContain('16');
  });

  it('깨진 날짜가 있어도 표 전체가 무너지지 않는다', () => {
    const days = buildTimetable({
      slots: [{ id: 'bad', startsAt: 'not-a-date', venue: 'A' }, ...SLOTS],
      applicantsBySlot: APPS,
      interviewersBySlot: STAFF,
      placeLabel: place,
    });
    expect(days).toHaveLength(1);
  });
});

describe('같은 시각·같은 장소 동시 면접(병렬 조)', () => {
  // 한 방에서 면접관 조를 나눠 동시에 여러 명을 본다 — 막을 것이 아니라 구분해 보여줘야 한다.
  const parallel: TimetableSlot[] = [
    { id: 'p1', startsAt: at('01:00'), durationMin: 30, venue: '학생회관 201호' },
    { id: 'p2', startsAt: at('01:00'), durationMin: 30, venue: '학생회관 201호' },
  ];

  it('한 칸에 조를 모두 담는다 — 하나만 보여주면 다른 조 지원자가 사라진다', () => {
    const [day] = buildTimetable({
      slots: parallel,
      applicantsBySlot: { p1: [{ name: '가가가' }], p2: [{ name: '나나나' }] },
      interviewersBySlot: { p1: ['이운영'], p2: ['최운영'] },
      placeLabel: place,
    });
    const cell = day!.rows[0]!.cells[0]!;
    expect(cell).toHaveLength(2);
    expect(cell.flatMap((c) => c.applicants.map((a) => a.name))).toEqual(['가가가', '나나나']);
  });

  it('조가 여럿일 때만 조 번호를 매긴다', () => {
    const [dup] = buildTimetable({
      slots: parallel,
      applicantsBySlot: {},
      interviewersBySlot: {},
      placeLabel: place,
    });
    expect(dup!.rows[0]!.cells[0]!.map((c) => c.panelNo)).toEqual([1, 2]);

    const [single] = buildTimetable({
      slots: [parallel[0]!],
      applicantsBySlot: {},
      interviewersBySlot: {},
      placeLabel: place,
    });
    expect(single!.rows[0]!.cells[0]![0]!.panelNo).toBe(0);
  });
});

describe('붙여넣기용 표', () => {
  it('탭 구분이라 엑셀에 그대로 들어가고, 칸 안에 줄바꿈을 넣지 않는다', () => {
    const days = buildTimetable({
      slots: SLOTS,
      applicantsBySlot: APPS,
      interviewersBySlot: STAFF,
      placeLabel: place,
    });
    const tsv = timetableToTsv(days);
    const header = tsv.split('\n')[1]!;
    expect(header.split('\t')[0]).toBe('시각');
    // 행 수 = 머리글 1 + 시각 3 (+ 날짜 1)
    expect(tsv.split('\n').filter((l) => l.includes('\t'))).toHaveLength(4);
    expect(tsv).toContain('가가가 / 이운영');
    expect(tsv).toContain('면접관 미정'); // c 는 면접관이 없다
  });

  it('한 칸의 여러 조는 줄바꿈 대신 이어 붙인다', () => {
    const days = buildTimetable({
      slots: [
        { id: 'p1', startsAt: at('01:00'), venue: 'A' },
        { id: 'p2', startsAt: at('01:00'), venue: 'A' },
      ],
      applicantsBySlot: { p1: [{ name: '가' }], p2: [{ name: '나' }] },
      interviewersBySlot: { p1: ['이'], p2: ['최'] },
      placeLabel: place,
    });
    const row = timetableToTsv(days).split('\n').find((l) => l.startsWith('10:00'))!;
    expect(row).toContain('1조 가 / 이 + 2조 나 / 최');
    expect(row.split('\t')).toHaveLength(2); // 시각 + 장소 1칸
  });
});

describe('면접관 없는 슬롯 집계', () => {
  it('지원자가 배정됐는데 면접관이 없는 슬롯만 센다', () => {
    const days = buildTimetable({
      slots: SLOTS,
      applicantsBySlot: APPS,
      interviewersBySlot: STAFF,
      placeLabel: place,
    });
    expect(slotsMissingInterviewers(days)).toBe(1); // c
  });

  it('지원자도 없는 빈 슬롯은 세지 않는다 — 만들자마자 늘 그 상태다', () => {
    const days = buildTimetable({
      slots: [{ id: 'empty', startsAt: at('01:00'), venue: 'A' }],
      applicantsBySlot: {},
      interviewersBySlot: {},
      placeLabel: place,
    });
    expect(slotsMissingInterviewers(days)).toBe(0);
  });
});
