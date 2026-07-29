import { describe, it, expect } from 'vitest';
import { normalizePhone, rankLabel, mergeLeaders } from './team-leaders';
import { leadersBlock } from '@/publishing/placeholders';

describe('normalizePhone', () => {
  it('숫자만 남긴다', () => {
    expect(normalizePhone('010-1234-5678')).toBe('01012345678');
    expect(normalizePhone(' 010 1234 5678 ')).toBe('01012345678');
    expect(normalizePhone(null)).toBe('');
  });
});

describe('rankLabel', () => {
  it('팀장 → 부팀장 → 기타 순', () => {
    expect(rankLabel('팀장')).toBeLessThan(rankLabel('부팀장'));
    expect(rankLabel('부팀장')).toBeLessThan(rankLabel('총무'));
    expect(rankLabel(null)).toBe(2);
  });
});

describe('mergeLeaders', () => {
  it('자동 명단은 직함 순(팀장→부팀장), 그다음 이름순', () => {
    const merged = mergeLeaders(
      [
        { label: '부팀장', name: '김철수', phone: '010-2' },
        { label: '팀장', name: '홍길동', phone: '010-1' },
      ],
      []
    );
    expect(merged.map((m) => m.name)).toEqual(['홍길동', '김철수']);
  });

  it('수동 항목도 자동 명단과 같은 정렬 규칙을 탄다(출처 때문에 뒤로 밀리지 않는다)', () => {
    const merged = mergeLeaders(
      [{ label: '부팀장', name: '김철수', phone: '010-2' }],
      [{ label: '팀장', name: '수동이', phone: '010-9' }]
    );
    // 수동이라도 팀장이면 앞이다. 예전에는 자동 명단만 정렬하고 수동을 뒤에 붙여 반대로 나왔다.
    expect(merged.map((m) => m.name)).toEqual(['수동이', '김철수']);
  });

  // 2026-07-29 QA 회귀: 어떤 팀은 가입자가 부팀장 1명뿐이고 팀장·다른 부팀장은 미가입(수동)이었다.
  // 자동만 정렬하고 수동을 뒤에 붙이던 탓에 공지에 "부팀장 → 팀장 → 부팀장" 으로 나갔다.
  it('가입자가 부팀장뿐이어도 팀장이 먼저 나온다', () => {
    const merged = mergeLeaders(
      [{ label: '부팀장', name: '김영희', phone: '010-2222-0000' }], // 자동(가입자)
      [
        { label: '팀장', name: '홍길동', phone: '010-1111-0000' }, // 수동(미가입)
        { label: '부팀장', name: '박민수', phone: '010-3333-0000' }, // 수동(미가입)
      ]
    );
    expect(merged.map((m) => `${m.label} ${m.name}`)).toEqual([
      '팀장 홍길동',
      '부팀장 김영희', // 같은 순위면 이름순 — 김 < 박
      '부팀장 박민수',
    ]);
  });

  it('같은 전화번호(형식 달라도)는 하나만 — 수동 입력이 나중에 가입해도 중복 안 됨', () => {
    const merged = mergeLeaders(
      [{ label: '팀장', name: '홍길동', phone: '010-1234-5678' }],
      [{ label: '팀장', name: '홍길동(수동)', phone: '01012345678' }]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.name).toBe('홍길동'); // 자동(가입 계정)이 우선
  });

  it('전화가 비면 중복 제거하지 않는다(서로 다른 사람일 수 있음)', () => {
    const merged = mergeLeaders(
      [{ label: '팀장', name: '홍길동', phone: '' }],
      [{ label: '부팀장', name: '김영희', phone: '' }]
    );
    expect(merged).toHaveLength(2);
  });

  it('이름·전화가 모두 비면 제외', () => {
    const merged = mergeLeaders([{ label: '팀장', name: '', phone: '' }], []);
    expect(merged).toHaveLength(0);
  });

  it('leadersBlock 과 합치면 공지 문구가 된다', () => {
    const merged = mergeLeaders(
      [
        { label: '팀장', name: '홍길동', phone: '010-1111-2222' },
        { label: '부팀장', name: '김철수', phone: '010-3333-4444' },
      ],
      []
    );
    expect(leadersBlock(merged)).toBe('팀장 홍길동 010-1111-2222\n부팀장 김철수 010-3333-4444');
  });
});
