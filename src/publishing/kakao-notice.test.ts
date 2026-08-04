import { describe, it, expect } from 'vitest';
import { buildKakaoNotice, kakaoReserveLabel, shortDateLabel } from './kakao-notice';

describe('shortDateLabel', () => {
  it('M/D(요일) — 0 을 채우지 않는다', () => {
    expect(shortDateLabel('2026-08-09')).toBe('8/9(일)'); // 2026-08-09 는 일요일
    expect(shortDateLabel('2026-08-08')).toBe('8/8(토)');
    expect(shortDateLabel('2026-12-25')).toBe('12/25(금)');
  });
  it('빈/잘못된 값 → null', () => {
    expect(shortDateLabel(null)).toBeNull();
    expect(shortDateLabel('')).toBeNull();
    expect(shortDateLabel('2026-8-9')).toBeNull();
    expect(shortDateLabel('2026-13-01')).toBeNull();
  });
});

describe('kakaoReserveLabel', () => {
  it('발행 시각 + 1분 을 KST 로 적는다', () => {
    // 2026-08-05T04:00Z = KST 13:00 → 예약은 13:01.
    expect(kakaoReserveLabel('2026-08-05T04:00:00.000Z')).toBe('8/5(수) 13:01');
  });
  it('브라우저 시간대와 무관하게 KST 로 나온다(UTC 로 도는 CI 포함)', () => {
    // KST 00:30 → 한국 날짜는 8/6 이다. UTC 로 읽으면 8/5 로 하루 어긋난다.
    expect(kakaoReserveLabel('2026-08-05T15:30:00.000Z')).toBe('8/6(목) 00:31');
  });
  it('자정 1분 전이면 날짜가 넘어간다', () => {
    // KST 23:59 + 1분 = 다음 날 00:00.
    expect(kakaoReserveLabel('2026-08-05T14:59:00.000Z')).toBe('8/6(목) 00:00');
  });
  it('시각 미정·잘못된 값 → null', () => {
    expect(kakaoReserveLabel(null)).toBeNull();
    expect(kakaoReserveLabel('')).toBeNull();
    expect(kakaoReserveLabel('bad')).toBeNull();
  });
});

const BOARD_URL = 'https://m.cafe.naver.com/ca-fe/web/cafes/29850342/menus/11';

describe('buildKakaoNotice', () => {
  it('봉사 공지 — 팀명·날짜·장소·게시판 주소가 들어간 전문', () => {
    expect(
      buildKakaoNotice({ teamName: '3팀', eventDate: '2026-08-08', place: '유기견보호소', boardUrl: BOARD_URL })
    ).toBe(
      `안녕하세요, 3팀 팀장단입니다.

8/8(토) 유기견보호소 봉사 공지 업로드 되었습니다.

많은 참여 부탁드립니다!

${BOARD_URL}`
    );
  });

  it('빈 줄을 포함한 줄바꿈이 템플릿 그대로 보존된다', () => {
    const text = buildKakaoNotice({ teamName: '3팀', eventDate: '2026-08-08', place: '보호소', boardUrl: BOARD_URL });
    // 문단 사이는 빈 줄 하나(= \n\n)로 유지된다. 카톡에 붙였을 때의 모양이 여기서 결정된다.
    expect(text.split('\n')).toEqual([
      '안녕하세요, 3팀 팀장단입니다.',
      '',
      '8/8(토) 보호소 봉사 공지 업로드 되었습니다.',
      '',
      '많은 참여 부탁드립니다!',
      '',
      BOARD_URL,
    ]);
  });

  it('일반 공지(회차 없음) — 제목을 쓰는 축약형', () => {
    expect(buildKakaoNotice({ title: '8월 정기총회 안내', teamName: null, boardUrl: BOARD_URL })).toBe(
      `안녕하세요

8월 정기총회 안내 업로드 되었습니다.

${BOARD_URL}`
    );
  });

  it('회차는 있지만 장소가 비었으면 축약형 — 구멍 난 문장을 내보내지 않는다', () => {
    const text = buildKakaoNotice({
      title: '8월 둘째 주 봉사',
      teamName: '3팀',
      eventDate: '2026-08-08',
      place: null,
      boardUrl: BOARD_URL,
    });
    expect(text).toBe(`안녕하세요

8월 둘째 주 봉사 업로드 되었습니다.

${BOARD_URL}`);
  });

  it('날짜가 비어도 축약형', () => {
    expect(
      buildKakaoNotice({ title: '봉사 공지', teamName: '3팀', eventDate: null, place: '보호소', boardUrl: BOARD_URL })
    ).toContain('봉사 공지 업로드 되었습니다.');
  });

  it('팀 이름이 없으면(개인 소유) 봉사 정보가 다 있어도 축약형', () => {
    const text = buildKakaoNotice({
      title: '번개 봉사',
      teamName: null,
      eventDate: '2026-08-08',
      place: '보호소',
      boardUrl: BOARD_URL,
    });
    expect(text).toContain('번개 봉사 업로드 되었습니다.');
    expect(text).not.toContain('팀장단');
  });

  it('제목이 비면 "공지" 로 둔다 — 문장이 깨지지 않게', () => {
    expect(buildKakaoNotice({ title: '  ', boardUrl: BOARD_URL })).toContain('공지 업로드 되었습니다.');
  });

  it('게시판 주소가 없으면 그 줄을 빼고 빈 줄로 끝나지 않는다', () => {
    const text = buildKakaoNotice({ teamName: '3팀', eventDate: '2026-08-08', place: '보호소', boardUrl: null });
    expect(text).toBe(`안녕하세요, 3팀 팀장단입니다.

8/8(토) 보호소 봉사 공지 업로드 되었습니다.

많은 참여 부탁드립니다!`);
    expect(text.endsWith('\n')).toBe(false);
  });

  it('팀명이 공백뿐이면 축약형으로 떨어진다', () => {
    expect(
      buildKakaoNotice({ title: '총회', teamName: '   ', eventDate: '2026-08-08', place: '보호소', boardUrl: BOARD_URL })
    ).toBe(`안녕하세요

총회 업로드 되었습니다.

${BOARD_URL}`);
  });
});
