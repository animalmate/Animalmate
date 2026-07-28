import { describe, it, expect } from 'vitest';
import { groupApplicantsBySlot, type GroupSlot } from './interview-groups';
import { slotPlaceLabel } from './display';

const place = (s: GroupSlot) => slotPlaceLabel(s);
const at = (utc: string) => `2026-08-15T${utc}:00Z`;

const SLOTS: GroupSlot[] = [
  { id: 's1', startsAt: at('01:00'), durationMin: 30, venue: '학생회관 201호' },
  { id: 's2', startsAt: at('01:30'), durationMin: 30, venue: '학생회관 201호' },
];

const A = (id: string, slotId: string | null) => ({ id, slotId });

describe('면접 슬롯별 묶기', () => {
  it('같은 슬롯 지원자를 한 묶음으로 준다 — 그 조가 함께 들어간다', () => {
    const groups = groupApplicantsBySlot({
      slots: SLOTS,
      applicants: [A('권예준', 's1'), A('김서준', 's1'), A('류도윤', 's1'), A('강지우', 's2')],
      placeLabel: place,
    });
    expect(groups[0]!.applicants.map((a) => a.id)).toEqual(['권예준', '김서준', '류도윤']);
    expect(groups[1]!.applicants.map((a) => a.id)).toEqual(['강지우']);
  });

  it('시간 순으로 준다', () => {
    const groups = groupApplicantsBySlot({
      slots: [SLOTS[1]!, SLOTS[0]!],
      applicants: [],
      placeLabel: place,
    });
    expect(groups.map((g) => g.slotId)).toEqual(['s1', 's2']);
  });

  it('지원자가 없는 슬롯도 묶음으로 남긴다 — 빈 시간대를 알아야 한다', () => {
    const groups = groupApplicantsBySlot({ slots: SLOTS, applicants: [], placeLabel: place });
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.applicants.length === 0)).toBe(true);
  });

  it('배정 못 받은 사람은 맨 뒤에 따로 둔다 — 목록에서 빼면 잊힌다', () => {
    const groups = groupApplicantsBySlot({
      slots: SLOTS,
      applicants: [A('가가가', 's1'), A('바바바', null)],
      placeLabel: place,
    });
    const last = groups[groups.length - 1]!;
    expect(last.slotId).toBeNull();
    expect(last.applicants.map((a) => a.id)).toEqual(['바바바']);
  });

  it('미배정자가 없으면 빈 묶음을 만들지 않는다', () => {
    const groups = groupApplicantsBySlot({
      slots: SLOTS,
      applicants: [A('가가가', 's1')],
      placeLabel: place,
    });
    expect(groups.every((g) => g.slotId !== null)).toBe(true);
  });

  it('면접관과 조 번호를 함께 담는다', () => {
    const groups = groupApplicantsBySlot({
      slots: SLOTS,
      applicants: [],
      interviewersBySlot: { s1: ['이찬구', '문보경'] },
      panelNumbers: { s1: 2 },
      placeLabel: place,
    });
    expect(groups[0]!.interviewers).toEqual(['이찬구', '문보경']);
    expect(groups[0]!.panelNo).toBe(2);
    expect(groups[1]!.interviewers).toEqual([]);
  });

  it('장소 표기는 화면과 같은 규칙을 쓴다', () => {
    const groups = groupApplicantsBySlot({
      slots: [{ id: 'r', startsAt: at('01:00'), venue: null, isRemote: true }],
      applicants: [],
      placeLabel: place,
    });
    expect(groups[0]!.placeLabel).toBe('비대면');
  });
});

describe('지금 진행 중인 시간대', () => {
  const start = Date.parse(at('01:00'));

  it('시작 시각부터 소요 시간까지가 지금이다', () => {
    const g = (nowMs: number) =>
      groupApplicantsBySlot({ slots: [SLOTS[0]!], applicants: [], placeLabel: place, nowMs })[0]!;
    expect(g(start).isNow).toBe(true);
    expect(g(start + 29 * 60_000).isNow).toBe(true);
    expect(g(start - 1).isNow).toBe(false);
    // 끝나는 순간은 다음 조의 시간이다.
    expect(g(start + 30 * 60_000).isNow).toBe(false);
  });

  it('현재 시각을 주지 않으면 아무것도 강조하지 않는다', () => {
    const groups = groupApplicantsBySlot({ slots: SLOTS, applicants: [], placeLabel: place });
    expect(groups.every((g) => !g.isNow)).toBe(true);
  });
});

describe('깨진 데이터', () => {
  it('시각이 깨진 슬롯은 뒤로 밀되 감추지 않는다', () => {
    const groups = groupApplicantsBySlot({
      slots: [{ id: 'bad', startsAt: 'not-a-date' }, SLOTS[0]!],
      applicants: [A('가가가', 'bad')],
      placeLabel: place,
    });
    expect(groups.map((g) => g.slotId)).toEqual(['s1', 'bad']);
    expect(groups[1]!.startsAtMs).toBeNull();
    expect(groups[1]!.applicants).toHaveLength(1);
  });

  it('없는 슬롯을 가리키는 지원자는 사라지지 않는다', () => {
    // 슬롯이 지워졌는데 배정이 남은 경우. 미배정으로 보이지 않으면 조용히 증발한다.
    const groups = groupApplicantsBySlot({
      slots: SLOTS,
      applicants: [A('유령', 'deleted-slot')],
      placeLabel: place,
    });
    const found = groups.flatMap((g) => g.applicants.map((a) => a.id));
    expect(found).toContain('유령');
  });
});
