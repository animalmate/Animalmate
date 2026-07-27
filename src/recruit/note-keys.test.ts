import { describe, it, expect } from 'vitest';
import { buildNoteKey, cohortNoteKeyPrefix, ALL_TEAMS } from './note-keys';

const COHORT = '11111111-2222-3333-4444-555555555555';

describe('공용 메모지 키', () => {
  it('기수·화면·팀이 다르면 서로 다른 메모지가 된다', () => {
    const a = buildNoteKey(COHORT, 'doc', '1팀 - 파주일산');
    const b = buildNoteKey(COHORT, 'doc', '2팀 - 서울');
    const c = buildNoteKey(COHORT, 'interview-console', '1팀 - 파주일산');
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('팀을 고르지 않으면 전체 메모지를 쓴다', () => {
    expect(buildNoteKey(COHORT, 'doc')).toBe(buildNoteKey(COHORT, 'doc', ALL_TEAMS));
    // 빈 문자열도 전체로 본다 — 필터 초기값이 비어 들어와도 키가 갈라지지 않게.
    expect(buildNoteKey(COHORT, 'doc', '')).toBe(buildNoteKey(COHORT, 'doc', ALL_TEAMS));
  });

  it('팀 이름에 콜론이 들어와도 기수·화면 구분이 깨지지 않는다', () => {
    const key = buildNoteKey(COHORT, 'doc', '1팀: 파주');
    expect(key.startsWith(`recruit:${COHORT}:doc:`)).toBe(true);
  });

  it('폐기 접두사가 그 기수의 메모지만 고른다', () => {
    const other = '99999999-8888-7777-6666-555555555555';
    const prefix = cohortNoteKeyPrefix(COHORT).replace(/%$/, '');
    expect(buildNoteKey(COHORT, 'doc', '1팀').startsWith(prefix)).toBe(true);
    expect(buildNoteKey(COHORT, 'interview-assign').startsWith(prefix)).toBe(true);
    expect(buildNoteKey(other, 'doc', '1팀').startsWith(prefix)).toBe(false);
  });
});
