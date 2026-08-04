import { describe, it, expect } from 'vitest';
import { cafeBoardUrl } from './cafe-url';

describe('cafeBoardUrl', () => {
  // 모바일 경로여야 한다 — 이 주소는 단톡방에서 휴대폰으로 눌린다(PC 경로는 인앱 브라우저에서
  // PC 화면이 그대로 떠서 못 쓴다, 2026-08-04).
  it('clubid + menuid 로 모바일 게시판 주소를 만든다', () => {
    expect(cafeBoardUrl(11, '29850342')).toBe('https://m.cafe.naver.com/ca-fe/web/cafes/29850342/menus/11');
  });
  it('menuid 0 도 유효한 값이다', () => {
    expect(cafeBoardUrl(0, '29850342')).toBe('https://m.cafe.naver.com/ca-fe/web/cafes/29850342/menus/0');
  });
  it('clubid 가 없으면 null — 주소를 지어내지 않는다', () => {
    expect(cafeBoardUrl(11, '')).toBeNull();
    expect(cafeBoardUrl(11, undefined)).toBeNull();
    expect(cafeBoardUrl(11, '   ')).toBeNull();
  });
  it('menuid 가 없으면 null', () => {
    expect(cafeBoardUrl(null, '29850342')).toBeNull();
    expect(cafeBoardUrl(undefined, '29850342')).toBeNull();
    expect(cafeBoardUrl(Number.NaN, '29850342')).toBeNull();
  });
});
