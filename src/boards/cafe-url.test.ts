import { describe, it, expect } from 'vitest';
import { cafeBoardUrl } from './cafe-url';

describe('cafeBoardUrl', () => {
  it('clubid + menuid 로 게시판 주소를 만든다', () => {
    expect(cafeBoardUrl(11, '29850342')).toBe('https://cafe.naver.com/f-e/cafes/29850342/menus/11');
  });
  it('menuid 0 도 유효한 값이다', () => {
    expect(cafeBoardUrl(0, '29850342')).toBe('https://cafe.naver.com/f-e/cafes/29850342/menus/0');
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
