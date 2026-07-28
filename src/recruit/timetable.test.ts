import { describe, it, expect } from 'vitest';
import { buildTimetable, timetableToTsv, slotsMissingInterviewers, type TimetableSlot } from './timetable';
import { slotPlaceLabel } from './display';

const place = (s: TimetableSlot) => slotPlaceLabel(s);
// 2026-08-15 10:00 KST = 01:00 UTC
const at = (utc: string) => `2026-08-15T${utc}:00Z`;

const build = (
  slots: TimetableSlot[],
  applicantsBySlot: Record<string, string[]> = {},
  interviewersBySlot: Record<string, string[]> = {}
) => buildTimetable({ slots, applicantsBySlot, interviewersBySlot, placeLabel: place });

describe('면접 시간표 — 조마다 표 하나', () => {
  it('장소별로 표를 나누고, 행은 시간 범위로 적는다', () => {
    const [day] = build([
      { id: 'a', startsAt: at('01:00'), durationMin: 30, venue: '학생회관 201호' },
      { id: 'b', startsAt: at('01:30'), durationMin: 30, venue: '학생회관 201호' },
      { id: 'c', startsAt: at('01:00'), durationMin: 30, venue: '동아리방' },
    ]);
    expect(day!.tracks.map((t) => t.label)).toEqual(['동아리방', '학생회관 201호']);
    expect(day!.tracks[0]!.rows.map((r) => r.timeLabel)).toEqual(['10:00 ~ 10:30', '10:30 ~ 11:00']);
  });

  it('빈 시간대도 줄로 남겨 조끼리 시간축을 맞춘다', () => {
    // 지난 기수 표가 그렇게 돼 있다 — 표 둘을 나란히 놓고 같은 줄을 봐야 한다.
    const [day] = build([
      { id: 'a', startsAt: at('01:00'), durationMin: 30, venue: 'A실' },
      { id: 'b', startsAt: at('01:30'), durationMin: 30, venue: 'B실' },
    ]);
    for (const t of day!.tracks) expect(t.rows).toHaveLength(2);
    const aRoom = day!.tracks.find((t) => t.label === 'A실')!;
    expect(aRoom.rows[1]!.slotId).toBeNull(); // 10:30 에는 A실 면접이 없다
    expect(aRoom.rows[1]!.applicants).toEqual([]);
  });

  it('같은 장소에서 동시에 도는 조는 표를 따로 만든다', () => {
    const [day] = build(
      [
        { id: 'p1', startsAt: at('01:00'), durationMin: 30, venue: '201호' },
        { id: 'p2', startsAt: at('01:00'), durationMin: 30, venue: '201호' },
        { id: 'p1b', startsAt: at('01:30'), durationMin: 30, venue: '201호' },
      ],
      { p1: ['가가가'], p2: ['나나나'], p1b: ['다다다'] },
      { p1: ['이운영'], p2: ['최운영'], p1b: ['이운영'] }
    );
    expect(day!.tracks.map((t) => t.label)).toEqual(['201호 1조', '201호 2조']);
    // 1조는 두 시간대 모두, 2조는 첫 시간대만.
    expect(day!.tracks[0]!.rows.map((r) => r.applicants)).toEqual([['가가가'], ['다다다']]);
    expect(day!.tracks[1]!.rows.map((r) => r.applicants)).toEqual([['나나나'], []]);
  });

  it('한 시간대에 여러 명을 본다(면접자 열이 여러 개)', () => {
    const [day] = build(
      [{ id: 'a', startsAt: at('01:00'), venue: 'A실' }],
      { a: ['가가가', '나나나', '다다다', '라라라', '마마마'] },
      { a: ['이운영', '최운영', '정운영'] }
    );
    expect(day!.applicantCols).toBe(5);
    expect(day!.interviewerCols).toBe(3);
  });

  it('열 수는 그날 최댓값으로 통일한다 — 표끼리 나란히 봐야 한다', () => {
    const [day] = build(
      [
        { id: 'a', startsAt: at('01:00'), venue: 'A실' },
        { id: 'b', startsAt: at('01:00'), venue: 'B실' },
      ],
      { a: ['가', '나', '다'], b: ['라'] },
      { a: ['이'], b: ['최', '정'] }
    );
    expect(day!.applicantCols).toBe(3);
    expect(day!.interviewerCols).toBe(2);
  });

  it('슬롯이 비어도 열이 0개가 되지는 않는다', () => {
    const [day] = build([{ id: 'a', startsAt: at('01:00'), venue: 'A실' }]);
    expect(day!.applicantCols).toBe(1);
    expect(day!.interviewerCols).toBe(1);
  });

  it('보는 사람의 시간대와 무관하게 한국 시간으로 찍는다', () => {
    const [day] = build([{ id: 'x', startsAt: '2026-08-15T01:00:00Z', durationMin: 30, venue: 'A실' }]);
    expect(day!.tracks[0]!.rows[0]!.timeLabel).toBe('10:00 ~ 10:30');
  });

  it('소요 시간이 반영된 종료 시각을 쓴다', () => {
    const [day] = build([{ id: 'x', startsAt: at('01:00'), durationMin: 20, venue: 'A실' }]);
    expect(day!.tracks[0]!.rows[0]!.timeLabel).toBe('10:00 ~ 10:20');
  });

  it('날짜가 여럿이면 날짜별로 나누고 순서대로 준다', () => {
    const days = build([
      { id: 'later', startsAt: '2026-08-16T01:00:00Z', venue: 'A실' },
      { id: 'earlier', startsAt: '2026-08-15T01:00:00Z', venue: 'A실' },
    ]);
    expect(days).toHaveLength(2);
    expect(days[0]!.dateLabel).toContain('15');
    expect(days[1]!.dateLabel).toContain('16');
  });

  it('깨진 날짜가 있어도 표 전체가 무너지지 않는다', () => {
    const days = build([
      { id: 'bad', startsAt: 'not-a-date', venue: 'A실' },
      { id: 'ok', startsAt: at('01:00'), venue: 'A실' },
    ]);
    expect(days).toHaveLength(1);
    expect(days[0]!.tracks[0]!.rows).toHaveLength(1);
  });
});

describe('붙여넣기용 표', () => {
  it('조마다 머리글을 두고 탭으로 끊는다', () => {
    const days = build(
      [
        { id: 'a', startsAt: at('01:00'), durationMin: 30, venue: 'A실' },
        { id: 'b', startsAt: at('01:30'), durationMin: 30, venue: 'A실' },
      ],
      { a: ['가가가', '나나나'], b: ['다다다'] },
      { a: ['이운영'], b: ['최운영'] }
    );
    const lines = timetableToTsv(days).split('\n');
    expect(lines[0]).toContain('8. 15.');
    expect(lines[1]!.split('\t')).toEqual(['A실', '면접관1', '면접자1', '면접자2']);
    expect(lines[2]!.split('\t')).toEqual(['10:00 ~ 10:30', '이운영', '가가가', '나나나']);
    // 빈 칸도 열 수를 맞춘다 — 안 그러면 엑셀에서 열이 밀린다.
    expect(lines[3]!.split('\t')).toEqual(['10:30 ~ 11:00', '최운영', '다다다', '']);
  });

  it('칸 안에 줄바꿈을 넣지 않는다', () => {
    const days = build([{ id: 'a', startsAt: at('01:00'), venue: 'A실' }], { a: ['가', '나'] }, { a: ['이'] });
    for (const line of timetableToTsv(days).split('\n')) expect(line).not.toContain('\n');
  });
});

describe('면접관 없는 슬롯 집계', () => {
  it('지원자가 배정됐는데 면접관이 없는 슬롯만 센다', () => {
    const days = build(
      [
        { id: 'a', startsAt: at('01:00'), venue: 'A실' },
        { id: 'b', startsAt: at('01:30'), venue: 'A실' },
      ],
      { a: ['가가가'], b: ['나나나'] },
      { a: ['이운영'] }
    );
    expect(slotsMissingInterviewers(days)).toBe(1);
  });

  it('지원자도 없는 빈 슬롯은 세지 않는다 — 만들자마자 늘 그 상태다', () => {
    const days = build([{ id: 'a', startsAt: at('01:00'), venue: 'A실' }]);
    expect(slotsMissingInterviewers(days)).toBe(0);
  });

  it('슬롯이 아예 없는 빈 줄은 세지 않는다', () => {
    const days = build(
      [
        { id: 'a', startsAt: at('01:00'), venue: 'A실' },
        { id: 'b', startsAt: at('01:30'), venue: 'B실' },
      ],
      { a: ['가가가'], b: ['나나나'] },
      { a: ['이운영'], b: ['최운영'] }
    );
    expect(slotsMissingInterviewers(days)).toBe(0);
  });
});
