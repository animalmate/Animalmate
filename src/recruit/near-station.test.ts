import { describe, it, expect } from 'vitest';
import { looksLikeAddress, countAddressLike } from './near-station';

// 값은 전부 가짜다. 33기 파일에서 실제로 문제가 됐던 **모양**만 가져왔다
// (`둔촌동역` 이 주소로 잡히고, 진짜 상세 주소는 샘플 5행 밖이라 안 뜬 일).
describe('가까운 역 칸 — 주소 판별', () => {
  it('역 이름은 주소가 아니다', () => {
    for (const v of [
      '둔촌동역',
      '종로3가역',
      '고덕역',
      '고덕역 3번 출구',
      '고덕역 3번출구',
      '천호역(5호선)',
      '강동구 둔촌동역',
      '5호선 천호역',
    ]) {
      expect(looksLikeAddress(v), v).toBe(false);
    }
  });

  it('번지·도로명·건물번호가 보이면 주소다', () => {
    for (const v of [
      '서울시 강동구 둔촌동 123-4',
      '강동구 양재대로 1234',
      '경기도 고양시 일산동구 중앙로 100',
      '둔촌동 123번지',
      '성내동 올림픽아파트 101동',
    ]) {
      expect(looksLikeAddress(v), v).toBe(true);
    }
  });

  it('행정구역이 두 단계 이상 이어지면 주소다', () => {
    expect(looksLikeAddress('서울시 강동구')).toBe(true);
    expect(looksLikeAddress('경기도 고양시 일산동구')).toBe(true);
  });

  it('지명 한 단계뿐이면 역명으로 본다 — 헛경보를 만들지 않는다', () => {
    expect(looksLikeAddress('둔촌동')).toBe(false);
    expect(looksLikeAddress('천호동')).toBe(false);
    expect(looksLikeAddress('일산')).toBe(false);
  });

  it('빈 값은 경고하지 않는다', () => {
    expect(looksLikeAddress('')).toBe(false);
    expect(looksLikeAddress('   ')).toBe(false);
    expect(looksLikeAddress(null)).toBe(false);
    expect(looksLikeAddress(undefined)).toBe(false);
  });

  // 옛 규칙(`/[시구동번지]/`)이 실제로 틀렸던 두 방향을 한 자리에 고정해 둔다.
  it('옛 규칙이 틀렸던 두 경우를 모두 바로잡는다', () => {
    expect(looksLikeAddress('둔촌동역')).toBe(false); // 옛 규칙: '동' 때문에 주소로 오해
    expect(looksLikeAddress('서울 강동구 성내동 45-6')).toBe(true); // 옛 규칙도 잡았지만 샘플 밖이면 안 보였다
  });

  it('전 행을 센다 — 미리보기 샘플에만 그리던 것을 대체한다', () => {
    const rows = [
      { nearStation: '고덕역' },
      { nearStation: '서울시 강동구 둔촌동 123-4' },
      { nearStation: null },
      { nearStation: '강동구 양재대로 1234' },
      { nearStation: '천호역' },
    ];
    expect(countAddressLike(rows)).toBe(2);
  });
});
