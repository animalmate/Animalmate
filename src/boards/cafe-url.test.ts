import { describe, it, expect } from 'vitest';
import { cafeBoardUrl, CAFE_VOLUNTEER_BOARD, isMobileUserAgent } from './cafe-url';

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

describe('봉사 기록 게시판 주소', () => {
  // 같은 게시판이어야 한다 — 경로만 다르고 clubid·menuid 가 어긋나면 한쪽이 엉뚱한 곳을 연다.
  it('PC·모바일이 같은 게시판을 가리킨다', () => {
    expect(CAFE_VOLUNTEER_BOARD.pc).toBe('https://cafe.naver.com/f-e/cafes/29850342/menus/21');
    expect(CAFE_VOLUNTEER_BOARD.mobile).toBe('https://m.cafe.naver.com/ca-fe/web/cafes/29850342/menus/21');
  });

  // 모바일 경로는 공지 발행용 주소와 같은 규칙을 쓴다(m. + ca-fe/web).
  it('모바일 경로가 cafeBoardUrl 규칙과 같다', () => {
    expect(CAFE_VOLUNTEER_BOARD.mobile).toBe(cafeBoardUrl(21, '29850342'));
  });
});

describe('isMobileUserAgent', () => {
  it('휴대폰 UA 를 알아본다', () => {
    // 안드로이드 크롬
    expect(isMobileUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S926N) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36')).toBe(true);
    // 아이폰 사파리
    expect(isMobileUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1')).toBe(true);
    // 카카오톡 인앱(안드로이드) — 단톡방에서 눌러 들어오는 경로다
    expect(isMobileUserAgent('Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 KAKAOTALK')).toBe(true);
  });

  it('PC UA 는 PC 로 둔다 — 창을 좁혀도 바뀌지 않는다', () => {
    expect(isMobileUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36')).toBe(false);
    expect(isMobileUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15')).toBe(false);
  });

  it('UA 가 없어도 터지지 않고 PC 로 본다', () => {
    expect(isMobileUserAgent(null)).toBe(false);
    expect(isMobileUserAgent(undefined)).toBe(false);
    expect(isMobileUserAgent('')).toBe(false);
  });
});
