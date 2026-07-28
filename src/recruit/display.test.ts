import { describe, it, expect } from 'vitest';
import { formatScore, docSampleState, slotPlaceLabel, slotPanelNumbers, slotPanelSuffix } from './display';

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

describe('동시 면접(병렬 조) 구분', () => {
  const T = '2026-08-15T01:00:00Z';
  const T2 = '2026-08-15T01:30:00Z';

  it('같은 시각·같은 장소가 여럿이면 조 번호를 매긴다', () => {
    // 드롭다운에 똑같은 줄이 두 개 떠서 어느 쪽을 고르는지 알 수 없던 문제.
    const n = slotPanelNumbers([
      { id: 'a', startsAt: T, venue: '학생회관 201호' },
      { id: 'b', startsAt: T, venue: '학생회관 201호' },
      { id: 'c', startsAt: T, venue: '학생회관 201호' },
    ]);
    expect(n).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('겹치지 않는 슬롯에는 번호를 붙이지 않는다(군더더기)', () => {
    const n = slotPanelNumbers([
      { id: 'a', startsAt: T, venue: '학생회관 201호' },
      { id: 'b', startsAt: T, venue: '동아리방' }, // 같은 시각 다른 장소
      { id: 'c', startsAt: T2, venue: '학생회관 201호' }, // 같은 장소 다른 시각
    ]);
    expect(n).toEqual({ a: 0, b: 0, c: 0 });
  });

  it('비대면끼리도 같은 시각이면 구분한다', () => {
    const n = slotPanelNumbers([
      { id: 'a', startsAt: T, venue: null, isRemote: true },
      { id: 'b', startsAt: T, venue: null, isRemote: true },
    ]);
    expect(n).toEqual({ a: 1, b: 2 });
  });

  it('대면과 비대면은 같은 시각이어도 다른 칸이다', () => {
    const n = slotPanelNumbers([
      { id: 'a', startsAt: T, venue: '학생회관 201호' },
      { id: 'b', startsAt: T, venue: null, isRemote: true },
    ]);
    expect(n).toEqual({ a: 0, b: 0 });
  });

  it('조 번호 꼬리표는 면접관을 알면 함께 적는다', () => {
    // 번호만 있으면 "1조가 누구지?"를 다시 찾아봐야 한다.
    expect(slotPanelSuffix(1, ['이운영', '최운영'])).toBe(' · 1조(이운영·최운영)');
    expect(slotPanelSuffix(2, [])).toBe(' · 2조');
    expect(slotPanelSuffix(0, ['이운영'])).toBe('');
  });
});
