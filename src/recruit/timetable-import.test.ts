import { describe, it, expect } from 'vitest';
import {
  parseStartHm,
  parseTimetableText,
  nameKey,
  buildImportPlan,
  assignmentsOf,
  ambiguousKey,
  summarizePlan,
  type ImportApplicant,
  type ImportSlot,
} from './timetable-import';

// 이름은 전부 가짜다(CLAUDE.md 규칙 #4 — 실명을 테스트 픽스처에 넣지 않는다).
// 표의 모양·오타·빈 칸 배치만 33기 A조 표에서 가져왔다.

/** KST 기준 시각으로 슬롯을 만든다(10:30 KST = 01:30 UTC). */
const at = (utc: string) => `2026-08-15T${utc}:00Z`;

// 33기 A조 슬롯 — 10:00부터 30분 간격.
const SLOTS: ImportSlot[] = [
  { id: 's1000', startsAt: at('01:00'), panel: 'A조' },
  { id: 's1030', startsAt: at('01:30'), panel: 'A조' },
  { id: 's1100', startsAt: at('02:00'), panel: 'A조' },
  { id: 's1130', startsAt: at('02:30'), panel: 'A조' },
];

const app = (id: string, name: string, extra: Partial<ImportApplicant> = {}): ImportApplicant => ({
  id,
  name,
  ...extra,
});

describe('시간 칸 읽기', () => {
  it('기본형을 읽는다', () => {
    expect(parseStartHm('10:30 ~ 11:00')).toBe('10:30');
    expect(parseStartHm('10:30~11:00')).toBe('10:30');
  });

  it('콜론이 세미콜론으로 찍힌 칸도 읽는다 — 33기 A조 표에 실제로 있었다', () => {
    // 여기서 못 읽으면 그 줄 5명이 조용히 배정되지 않는다.
    expect(parseStartHm('11:00 ~ 11;30')).toBe('11:00');
  });

  it('한 자리 시각과 끝 시각 없는 칸도 읽는다', () => {
    expect(parseStartHm('9:00 ~ 9:30')).toBe('09:00');
    expect(parseStartHm('14:00')).toBe('14:00');
  });

  it('시각이 아닌 칸은 null', () => {
    expect(parseStartHm('면접실 정비')).toBeNull();
    expect(parseStartHm('가나다')).toBeNull();
    expect(parseStartHm('')).toBeNull();
    expect(parseStartHm('99:99')).toBeNull();
  });
});

describe('표 읽기', () => {
  // 33기 A조 표 그대로 — 시간이 가운데(4번째 열), 왼쪽이 면접관.
  const A_TABLE = [
    '면접관1\t면접관2\t면접관3\tA조\t면접자1\t면접자2\t면접자3\t면접자4\t면접자5\t예비석',
    '\t\t\t10:00 ~ 10:30\t\t\t\t\t\t',
    '운영가\t운영나\t운영다\t10:30 ~ 11:00\t가나다\t가나라\t가나마\t가나바\t가나사\t',
    '운영가\t운영나\t운영다\t11:00 ~ 11;30\t다라마\t다라바\t다라사\t다라아\t\t',
    '운영마\t운영바\t운영사\t11:30 ~ 12:00\t마바사\t마바아\t마바자\t마바차\t마바카\t',
  ].join('\n');

  it('시간 왼쪽의 면접관을 면접자로 읽지 않는다', () => {
    const { rows, usedHeader } = parseTimetableText(A_TABLE);
    expect(usedHeader).toBe(true);
    const row = rows.find((r) => r.startHm === '10:30')!;
    expect(row.names).toEqual(['가나다', '가나라', '가나마', '가나바', '가나사']);
    // 운영가·운영나·운영다는 면접관이다 — 여기 섞이면 면접관이 면접을 보게 된다.
    expect(row.names).not.toContain('운영가');
  });

  it('빈 칸은 이름으로 세지 않는다', () => {
    const { rows } = parseTimetableText(A_TABLE);
    expect(rows.find((r) => r.startHm === '11:00')!.names).toEqual(['다라마', '다라바', '다라사', '다라아']);
    expect(rows.find((r) => r.startHm === '10:00')!.names).toEqual([]);
  });

  it('시간이 맨 앞인 표(이 화면이 내보낸 TSV)도 같은 결과를 준다', () => {
    const exported = [
      'A조\t면접관1\t면접관2\t면접관3\t면접자1\t면접자2',
      '10:30 ~ 11:00\t운영가\t운영나\t운영다\t가나다\t가나라',
    ].join('\n');
    const { rows } = parseTimetableText(exported);
    expect(rows[0]!.names).toEqual(['가나다', '가나라']);
  });

  it('머리글이 없으면 시간 칸 오른쪽을 이름으로 본다', () => {
    const { rows, usedHeader } = parseTimetableText('10:30 ~ 11:00\t가나다\t가나라');
    expect(usedHeader).toBe(false);
    expect(rows[0]!.names).toEqual(['가나다', '가나라']);
  });

  it('머리글이 본문과 밀려 있으면 머리글을 믿지 않는다', () => {
    // 머리글은 5열인데 본문은 4열 — 머리글 번호를 그대로 믿으면 이름이 한 칸씩 밀려
    // **다른 사람이 배정된다**. 조용히 틀리느니 시간 칸 오른쪽을 읽는다.
    const { rows, usedHeader } = parseTimetableText(
      ['면접관1\tA조\t면접자1\t면접자2\t면접자3', '10:30 ~ 11:00\t가나다\t가나라\t가나마'].join('\n')
    );
    expect(usedHeader).toBe(false);
    expect(rows[0]!.names).toEqual(['가나다', '가나라', '가나마']);
  });

  it('시각 없는 줄은 버리지 않고 사람에게 돌려준다', () => {
    // '면접실 정비'는 넘겨도 되는 줄이지만, 시간 칸이 밀린 진짜 배정 줄과 구분할 수 없다.
    const { skipped } = parseTimetableText(
      ['면접관1\tB조\t면접자1', '면접실 정비\t\t', '11:00 ~ 11:30\t운영라\t사아자'].join('\n')
    );
    expect(skipped).toContain('면접실 정비');
  });

  it('탭이 없으면 2칸 이상 공백으로 나눈다', () => {
    const { rows } = parseTimetableText('10:30 ~ 11:00   가나다   가나라');
    expect(rows[0]!.names).toEqual(['가나다', '가나라']);
  });

  it('빈 입력에 터지지 않는다', () => {
    expect(parseTimetableText('').rows).toEqual([]);
    expect(parseTimetableText('\n\n\t\t').rows).toEqual([]);
  });
});

describe('이름 키', () => {
  it('공백과 괄호 주석을 걷어낸다', () => {
    expect(nameKey('가 나다')).toBe('가나다');
    expect(nameKey('가나다(1팀)')).toBe('가나다');
  });

  it('띄어 쓴 외국 이름도 한 사람으로 묶는다 — 33기에 실제로 있었다', () => {
    expect(nameKey('제인 도')).toBe('제인도');
  });
});

describe('배정 계획 세우기', () => {
  const TEXT = [
    '면접관1\tA조\t면접자1\t면접자2\t면접자3',
    '운영가\t10:30 ~ 11:00\t가나다\t가나라\t가나마',
  ].join('\n');

  it('이름을 슬롯에 맞춘다', () => {
    const plan = buildImportPlan({
      text: TEXT,
      slots: SLOTS,
      applicants: [app('a1', '가나다'), app('a2', '가나라'), app('a3', '가나마')],
    });
    expect(assignmentsOf(plan.outcomes)).toEqual([
      { applicantId: 'a1', slotId: 's1030' },
      { applicantId: 'a2', slotId: 's1030' },
      { applicantId: 'a3', slotId: 's1030' },
    ]);
  });

  it('다른 슬롯에 있던 사람은 옮기기로 표시한다', () => {
    const plan = buildImportPlan({
      text: TEXT,
      slots: SLOTS,
      applicants: [app('a1', '가나다', { slotId: 's1100' }), app('a2', '가나라'), app('a3', '가나마')],
    });
    const moved = plan.outcomes.find((o) => o.name === '가나다');
    expect(moved).toMatchObject({ kind: 'ok', fromSlotId: 's1100' });
    expect(summarizePlan(plan).moves).toBe(1);
  });

  it('이미 그 슬롯이면 바꿀 것이 없다 — 요청과 audit 을 허수로 부풀리지 않는다', () => {
    const plan = buildImportPlan({
      text: TEXT,
      slots: SLOTS,
      applicants: [app('a1', '가나다', { slotId: 's1030' }), app('a2', '가나라'), app('a3', '가나마')],
    });
    expect(summarizePlan(plan).same).toBe(1);
    expect(assignmentsOf(plan.outcomes).map((a) => a.applicantId)).toEqual(['a2', 'a3']);
  });

  it('명단에 없는 이름은 unknown 으로 남긴다 — 조용히 넘어가면 그 사람이 증발한다', () => {
    const plan = buildImportPlan({
      text: TEXT,
      slots: SLOTS,
      applicants: [app('a1', '가나다'), app('a2', '가나라')],
    });
    expect(plan.outcomes.find((o) => o.name === '가나마')).toMatchObject({ kind: 'unknown' });
    expect(summarizePlan(plan).unknown).toBe(1);
    // 못 찾은 사람 때문에 나머지 배정을 막지는 않는다.
    expect(assignmentsOf(plan.outcomes)).toHaveLength(2);
  });

  it('동명이인은 사람이 고를 때까지 배정하지 않는다', () => {
    const plan = buildImportPlan({
      text: TEXT,
      slots: SLOTS,
      applicants: [
        app('a1', '가나다', { phone: '010-1111-2222', wishTeam1: '기획' }),
        app('a9', '가나다', { phone: '010-3333-4444', wishTeam1: '홍보' }),
        app('a2', '가나라'),
        app('a3', '가나마'),
      ],
    });
    const amb = plan.outcomes.find((o) => o.kind === 'ambiguous')!;
    expect(amb).toMatchObject({ kind: 'ambiguous', name: '가나다' });
    // 고르기 전에는 빠진다.
    expect(assignmentsOf(plan.outcomes).map((a) => a.applicantId)).toEqual(['a2', 'a3']);
    // 고르면 들어간다.
    const picked = assignmentsOf(plan.outcomes, { [ambiguousKey(amb)]: 'a9' });
    expect(picked).toContainEqual({ applicantId: 'a9', slotId: 's1030' });
  });

  it('표에 있는데 이 조에 없는 시각을 알려 준다', () => {
    const plan = buildImportPlan({
      text: '시간\t면접자1\n09:00 ~ 09:30\t가나다',
      slots: SLOTS,
      applicants: [app('a1', '가나다')],
    });
    expect(plan.missingTimes).toEqual(['09:00']);
    expect(assignmentsOf(plan.outcomes)).toEqual([]);
  });

  it('한 사람이 두 번 나오면 뒤엣것을 배정하지 않는다 — 앞 슬롯이 조용히 비는 것을 막는다', () => {
    const plan = buildImportPlan({
      text: ['시간\t면접자1', '10:30 ~ 11:00\t가나다', '11:00 ~ 11:30\t가나다'].join('\n'),
      slots: SLOTS,
      applicants: [app('a1', '가나다')],
    });
    expect(assignmentsOf(plan.outcomes)).toEqual([{ applicantId: 'a1', slotId: 's1030' }]);
    expect(summarizePlan(plan).unknown).toBe(1);
  });

  it('같은 사람을 두 슬롯에 넣는 결과를 내보내지 않는다', () => {
    const plan = buildImportPlan({
      text: ['시간\t면접자1', '10:30 ~ 11:00\t가나다'].join('\n'),
      slots: SLOTS,
      applicants: [app('a1', '가나다')],
    });
    const ids = assignmentsOf(plan.outcomes).map((a) => a.applicantId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
