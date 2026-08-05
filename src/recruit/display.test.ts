import { describe, it, expect } from 'vitest';
import { formatScore, docSampleState, slotPlaceLabel, slotPanelNumbers, slotPanelSuffix, slotPanelLabel, suggestNextPanelName } from './display';

describe('점수 표기', () => {
  it('정수 평균도 소수 첫째 자리까지 쓴다', () => {
    // 이게 없어서 명단에 `9점`과 `7.8점`이 섞였다.
    expect(formatScore(9)).toBe('9.0');
    expect(formatScore(5)).toBe('5.0');
    expect(formatScore(7.8)).toBe('7.8');
    expect(formatScore(10)).toBe('10.0');
  });

  it('점수가 없으면 null 을 돌려준다(대체 문구는 화면이 정한다)', () => {
    expect(formatScore(null)).toBeNull();
    expect(formatScore(undefined)).toBeNull();
    expect(formatScore(NaN)).toBeNull();
  });

  it('0점은 값이 없는 것과 다르다', () => {
    expect(formatScore(0)).toBe('0.0');
  });
});

describe('서류 채점 표본 상태', () => {
  it('아무도 안 본 것과 적게 본 것을 구분한다', () => {
    expect(docSampleState(0)).toBe('unscored');
    expect(docSampleState(1)).toBe('deficient');
    expect(docSampleState(2)).toBe('deficient');
    expect(docSampleState(3)).toBe('ok');
    expect(docSampleState(5)).toBe('ok');
  });
});

describe('면접 슬롯 장소 표기', () => {
  it('비대면 판정은 venue 문자열이 아니라 isRemote 로 한다', () => {
    // venue 가 비어 있는 비대면 슬롯이 "대면"으로 표시되던 버그.
    expect(slotPlaceLabel({ isRemote: true, venue: null })).toBe('비대면');
    expect(slotPlaceLabel({ isRemote: true, venue: '' })).toBe('비대면');
  });

  it('화면으로 만든 비대면 슬롯의 문구는 그대로 쓴다', () => {
    expect(slotPlaceLabel({ isRemote: true, venue: '비대면 (온라인 화상)' })).toBe('비대면 (온라인 화상)');
  });

  it('비대면인데 장소 설명이 따로 있으면 함께 보여준다', () => {
    expect(slotPlaceLabel({ isRemote: true, venue: '줌 A방' })).toBe('비대면 · 줌 A방');
  });

  it('대면은 장소를, 장소가 없으면 대면이라고 쓴다', () => {
    expect(slotPlaceLabel({ isRemote: false, venue: '학생회관 201호' })).toBe('학생회관 201호');
    expect(slotPlaceLabel({ isRemote: false, venue: null })).toBe('대면');
    expect(slotPlaceLabel({})).toBe('대면');
  });
});

describe('조 이름(panel 컬럼 우선, 옛 슬롯은 순번 fallback)', () => {
  const T = '2026-08-15T01:00:00Z';

  it('panel 컬럼이 있으면 그대로 쓴다', () => {
    expect(slotPanelLabel({ id: 'a', panel: 'A조' })).toBe('A조');
    expect(slotPanelLabel({ id: 'a', panel: '비대면 파견' })).toBe('비대면 파견');
  });

  it('panel 이 비면 같은 시각 순번으로 임시 이름을 만든다(0026 이전 슬롯)', () => {
    const numbers = slotPanelNumbers([
      { id: 'a', startsAt: T, venue: '학생회관 201호' },
      { id: 'b', startsAt: T, venue: '동아리방' },
    ]);
    expect(slotPanelLabel({ id: 'a', panel: null }, numbers)).toBe('1조');
    expect(slotPanelLabel({ id: 'b' }, numbers)).toBe('2조');
  });

  it('panel 도 순번도 없으면 빈 문자열(꼬리표를 붙이지 않는다)', () => {
    expect(slotPanelLabel({ id: 'a', panel: '  ' }, {})).toBe('');
  });

  it('조 이름이 있으면 순번은 무시한다 — 컬럼이 진실이다', () => {
    // 순번은 A조가 한 시간대를 비우면 밀린다. 컬럼이 있는데 순번을 쓰면 이름이 하루 중에 바뀐다.
    const numbers = { a: 2 };
    expect(slotPanelLabel({ id: 'a', panel: 'A조' }, numbers)).toBe('A조');
  });
});

describe('다음 조 이름 제안', () => {
  it('아직 없으면 A조부터', () => {
    expect(suggestNextPanelName([])).toBe('A조');
  });

  it('쓰는 이름 다음 글자를 준다', () => {
    expect(suggestNextPanelName(['A조'])).toBe('B조');
    expect(suggestNextPanelName(['A조', 'B조'])).toBe('C조');
  });

  it('가운데가 비면 그 자리를 준다', () => {
    expect(suggestNextPanelName(['A조', 'C조'])).toBe('B조');
  });

  it('규칙이 다른 이름은 자리를 차지하지 않는다', () => {
    // 조 구성은 기수마다 다르다 — '비대면 파견'처럼 글자 이름을 써도 A조 제안이 막히면 안 된다.
    expect(suggestNextPanelName(['비대면 파견'])).toBe('A조');
    expect(suggestNextPanelName(['비대면 파견', 'A조'])).toBe('B조');
  });

  it('공백만 있는 이름은 없는 것으로 본다', () => {
    expect(suggestNextPanelName(['  ', ''])).toBe('A조');
  });

  it('Z조까지 차면 빈 문자열 — 사람이 직접 쓴다', () => {
    const all = Array.from({ length: 26 }, (_, i) => `${String.fromCharCode(65 + i)}조`);
    expect(suggestNextPanelName(all)).toBe('');
  });
});

describe('동시 면접(병렬 조) 구분', () => {
  const T = '2026-08-15T01:00:00Z';
  const T2 = '2026-08-15T01:30:00Z';

  it('같은 시각이 여럿이면 조 번호를 매긴다', () => {
    // 드롭다운에 똑같은 줄이 두 개 떠서 어느 쪽을 고르는지 알 수 없던 문제.
    const n = slotPanelNumbers([
      { id: 'a', startsAt: T, venue: '학생회관 201호' },
      { id: 'b', startsAt: T, venue: '학생회관 201호' },
      { id: 'c', startsAt: T, venue: '학생회관 201호' },
    ]);
    expect(n).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('같은 시각이면 장소가 달라도 조 번호를 매긴다', () => {
    // 방을 나눠 동시에 진행하는 경우(3층·4층). 예전에는 장소까지 같아야 번호를 줬는데,
    // 그러면 양쪽 다 0번이 되어 시간대 칩·드롭다운에서 둘을 구별할 수 없었다.
    const n = slotPanelNumbers([
      { id: 'a', startsAt: T, venue: '학생회관 201호' },
      { id: 'b', startsAt: T, venue: '동아리방' },
      { id: 'c', startsAt: T2, venue: '학생회관 201호' }, // 혼자인 시각은 그대로 0
    ]);
    expect(n).toEqual({ a: 1, b: 2, c: 0 });
  });

  it('겹치지 않는 시각에는 번호를 붙이지 않는다(군더더기)', () => {
    const n = slotPanelNumbers([
      { id: 'a', startsAt: T, venue: '학생회관 201호' },
      { id: 'b', startsAt: T2, venue: '동아리방' },
    ]);
    expect(n).toEqual({ a: 0, b: 0 });
  });

  it('비대면끼리도 같은 시각이면 구분한다', () => {
    const n = slotPanelNumbers([
      { id: 'a', startsAt: T, venue: null, isRemote: true },
      { id: 'b', startsAt: T, venue: null, isRemote: true },
    ]);
    expect(n).toEqual({ a: 1, b: 2 });
  });

  it('대면과 비대면도 같은 시각이면 한 묶음으로 번호를 매긴다', () => {
    // 지원자에게는 "2시 1조 / 2시 2조"로 불리는 같은 시간대다 — 방식이 달라도 시각이 축이다.
    const n = slotPanelNumbers([
      { id: 'a', startsAt: T, venue: '학생회관 201호' },
      { id: 'b', startsAt: T, venue: null, isRemote: true },
    ]);
    expect(n).toEqual({ a: 1, b: 2 });
  });

  it('조 꼬리표는 면접관을 알면 함께 적는다', () => {
    // 이름만 있으면 "A조가 누구지?"를 다시 찾아봐야 한다.
    expect(slotPanelSuffix('A조', ['이운영', '최운영'])).toBe(' · A조(이운영·최운영)');
    expect(slotPanelSuffix('B조', [])).toBe(' · B조');
    expect(slotPanelSuffix('', ['이운영'])).toBe('');
  });
});
