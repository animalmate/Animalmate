import { describe, it, expect } from 'vitest';
import { rankCandidates, type Candidate } from './seat-search';

// 이름은 전부 가짜다(CLAUDE.md 규칙 #4 — 실명을 테스트 픽스처에 넣지 않는다).
// '가나'로 시작하는 이름들은 첫머리 일치를, '라가마'는 중간 글자 일치를 시험하기 위한 것이다.
const c = (name: string, extra: Partial<Candidate> = {}): Candidate => ({
  id: name,
  name,
  team: null,
  seatedSlotId: null,
  seatedAt: null,
  remote: false,
  ...extra,
});

describe('배정 칸 후보 순서', () => {
  it('빈 글자에는 아무것도 주지 않는다 — 칸을 열자마자 전 명단이 쏟아지면 안 된다', () => {
    expect(rankCandidates([c('가나다')], '')).toEqual([]);
    expect(rankCandidates([c('가나다')], '   ')).toEqual([]);
  });

  it('미배정을 이미 앉은 사람보다 먼저 준다', () => {
    // 여기가 뒤집히면 Enter 한 번에 **남의 자리에서 사람을 빼 온다**.
    const out = rankCandidates(
      [c('가나다', { seatedSlotId: 's1', seatedAt: 'A조 13:00' }), c('가나라')],
      '가나'
    );
    expect(out.map((x) => x.name)).toEqual(['가나라', '가나다']);
  });

  it('이름 첫머리가 맞는 것을 먼저 준다', () => {
    const out = rankCandidates([c('라가마'), c('가나다')], '가');
    expect(out[0]!.name).toBe('가나다');
  });

  it('중간 글자로도 찾힌다', () => {
    expect(rankCandidates([c('라가마')], '가').map((x) => x.name)).toEqual(['라가마']);
  });

  it('공백을 무시하고 맞춘다', () => {
    // 띄어 쓴 외국 이름이 실제로 있었다(33기).
    expect(rankCandidates([c('제인 도')], '제인').map((x) => x.name)).toEqual(['제인 도']);
    expect(rankCandidates([c('가나다')], '가 나').map((x) => x.name)).toEqual(['가나다']);
  });

  it('지금 이 슬롯에 앉은 사람은 뺀다 — 골라 봐야 제자리다', () => {
    const out = rankCandidates(
      [c('가나다', { seatedSlotId: 's1', seatedAt: 'A조 13:00' }), c('가나라')],
      '가나',
      's1'
    );
    expect(out.map((x) => x.name)).toEqual(['가나라']);
  });

  it('다른 슬롯에 앉은 사람은 남긴다 — 이름을 쳐서 옮길 수 있어야 한다', () => {
    const out = rankCandidates(
      [c('가나다', { seatedSlotId: 's2', seatedAt: 'B조 13:00' })],
      '가나',
      's1'
    );
    expect(out.map((x) => x.name)).toEqual(['가나다']);
  });

  it('같은 조건이면 이름순 — 손이 순서를 기억할 수 있어야 한다', () => {
    const out = rankCandidates([c('가나사'), c('가나다'), c('가나라')], '가나');
    expect(out.map((x) => x.name)).toEqual(['가나다', '가나라', '가나사']);
  });

  it('8명까지만 준다 — 더 좁히려면 글자를 더 치면 된다', () => {
    const many = Array.from({ length: 20 }, (_, i) => c(`가나${String(i).padStart(2, '0')}`));
    expect(rankCandidates(many, '가나')).toHaveLength(8);
  });

  it('맞는 이름이 없으면 빈 목록', () => {
    expect(rankCandidates([c('가나다')], '마').toString()).toBe('');
  });
});
