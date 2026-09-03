// 번개 — 순수 로직만(DB 접근은 test/ 통합 테스트 몫).
// 여기서 지키는 것 두 가지:
//  1) 입력 검증(CLAUDE.md 코드 컨벤션: 권한·날짜·상태머신은 반드시 단위 테스트)
//  2) **선착순·대기 계산** — 이 기능의 존재 이유가 "순서를 DB 가 기억한다" 이므로,
//     자리 배정이 틀리면 기능 전체가 무의미하다.
// 권한(개최자만 수정, 부원은 승인 대기)은 src/auth/permissions.test.ts 가 authorize 로 검증한다.

import { describe, it, expect } from 'vitest';
import {
  normalizeFlashInput,
  normalizeCapacity,
  normalizeMessage,
  initialFlashStatus,
  assignSeats,
  acceptsSignups,
  isPublicFlash,
  normalizeSignupOpenAt,
  signupWindow,
  FlashInputError,
  type FlashInput,
  type SeatRow,
} from './flash';

const base: FlashInput = { title: '방탈출 번개', meetDate: '2026-09-12' };

describe('normalizeFlashInput', () => {
  it('공백을 정리하고 빈 값은 null 로 접는다', () => {
    const v = normalizeFlashInput({ ...base, title: '  방탈출  ', place: '   ', details: '', meetTime: '' });
    expect(v).toMatchObject({ title: '방탈출', place: null, details: null, meetTime: null, capacity: null });
  });

  it('이름이 없으면 거절한다', () => {
    expect(() => normalizeFlashInput({ ...base, title: '   ' })).toThrow(FlashInputError);
  });

  it('날짜 형식이 틀리면 거절한다', () => {
    expect(() => normalizeFlashInput({ ...base, meetDate: '9/12' })).toThrow(FlashInputError);
  });

  it("DB 왕복값 'HH:MM:SS' 를 받아 초를 잘라낸다", () => {
    expect(normalizeFlashInput({ ...base, meetTime: '19:30:00' }).meetTime).toBe('19:30');
  });

  it('시간 형식이 틀리면 거절한다', () => {
    expect(() => normalizeFlashInput({ ...base, meetTime: '25:00' })).toThrow(FlashInputError);
  });

  it('지난 날짜는 막지 않는다(뒤늦게 기록하는 번개가 있다)', () => {
    expect(normalizeFlashInput({ ...base, meetDate: '2020-01-01' }).meetDate).toBe('2020-01-01');
  });

  it('너무 긴 세부 내용은 거절한다(잘라서 저장하지 않는다)', () => {
    expect(() => normalizeFlashInput({ ...base, details: 'ㄱ'.repeat(4001) })).toThrow(FlashInputError);
  });
});

describe('normalizeSignupOpenAt — 9시간 어긋나면 오픈런이 통째로 거짓이 된다', () => {
  it('화면이 준 벽시계를 **KST 로 못 박아** 읽는다(브라우저 시간대와 무관)', () => {
    expect(normalizeSignupOpenAt('2030-09-30T15:00')!.toISOString()).toBe('2030-09-30T06:00:00.000Z');
  });

  it('빈 칸은 null — 올라간 때부터 바로 받는다는 뜻이다', () => {
    expect(normalizeSignupOpenAt('')).toBeNull();
    expect(normalizeSignupOpenAt(null)).toBeNull();
    expect(normalizeSignupOpenAt('   ')).toBeNull();
  });

  it('DB 왕복값(ISO)도 받아 준다 — 수정 화면이 받은 값을 그대로 되돌려 보낸다', () => {
    expect(normalizeSignupOpenAt('2030-09-30T06:00:00.000Z')!.toISOString()).toBe('2030-09-30T06:00:00.000Z');
  });

  it('말이 안 되는 값은 거절한다(조용히 null 로 접지 않는다 — 그러면 즉시 열려 버린다)', () => {
    expect(() => normalizeSignupOpenAt('내일 3시')).toThrow(FlashInputError);
  });
});

describe('signupWindow', () => {
  const AT = new Date('2030-09-30T06:00:00Z'); // KST 15:00

  it('시작 시각이 없으면 모집 중일 때 바로 열린다', () => {
    expect(signupWindow('open', null, new Date('2030-01-01T00:00:00Z'))).toBe('open');
  });

  it('시작 전이면 not_yet, 지나면 open', () => {
    expect(signupWindow('open', AT, new Date('2030-09-30T05:59:59Z'))).toBe('not_yet');
    expect(signupWindow('open', AT, new Date('2030-09-30T06:00:00Z'))).toBe('open'); // 정각은 열린 것
    expect(signupWindow('open', AT, new Date('2030-09-30T06:00:01Z'))).toBe('open');
  });

  it('마감했으면 시작 시각과 무관하게 closed', () => {
    expect(signupWindow('closed', AT, new Date('2030-01-01T00:00:00Z'))).toBe('closed');
    expect(signupWindow('closed', null, new Date('2031-01-01T00:00:00Z'))).toBe('closed');
  });

  it('승인 전·거절·취소는 신청이라는 개념 자체가 없다', () => {
    for (const st of ['pending', 'rejected', 'canceled'] as const) {
      expect(signupWindow(st, null, new Date())).toBe('unavailable');
      expect(signupWindow(st, AT, new Date('2031-01-01T00:00:00Z'))).toBe('unavailable');
    }
  });
});

describe('normalizeCapacity', () => {
  it('빈 칸과 0 이하는 전부 제한 없음(null)이다', () => {
    expect(normalizeCapacity(null)).toBeNull();
    expect(normalizeCapacity(undefined)).toBeNull();
    expect(normalizeCapacity(0)).toBeNull();
    expect(normalizeCapacity(-3)).toBeNull();
  });

  it('소수는 내림한다', () => {
    expect(normalizeCapacity(5.9)).toBe(5);
  });

  it('동아리 인원을 넘는 값은 거절한다', () => {
    expect(() => normalizeCapacity(1000)).toThrow(FlashInputError);
  });

  it('숫자가 아닌 값은 거절한다', () => {
    expect(() => normalizeCapacity(Number.NaN)).toThrow(FlashInputError);
  });
});

describe('normalizeMessage', () => {
  it('앞뒤 공백을 정리한다', () => {
    expect(normalizeMessage('  테마 1 참가하고 싶습니다!  ')).toBe('테마 1 참가하고 싶습니다!');
  });

  it('빈 메시지는 거절한다 — 메시지가 곧 신청이라 빈 신청이 생기면 안 된다', () => {
    expect(() => normalizeMessage('   ')).toThrow(FlashInputError);
    expect(() => normalizeMessage(null)).toThrow(FlashInputError);
  });

  it('너무 긴 메시지는 거절한다', () => {
    expect(() => normalizeMessage('가'.repeat(1001))).toThrow(FlashInputError);
  });
});

describe('initialFlashStatus', () => {
  it('부원이 낸 개최는 승인 대기로 들어간다', () => {
    expect(initialFlashStatus('member')).toBe('pending');
  });

  it('운영진 이상은 곧바로 모집 중이다', () => {
    expect(initialFlashStatus('staff')).toBe('open');
    expect(initialFlashStatus('board')).toBe('open');
    expect(initialFlashStatus('sysadmin')).toBe('open');
  });
});

describe('assignSeats', () => {
  const rows = (n: number): SeatRow[] =>
    Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, seq: i + 1, status: 'confirmed' as const }));

  it('정원까지는 확정, 나머지는 대기 — 순번은 각각 1부터 센다', () => {
    const seats = assignSeats(rows(7), 5);
    expect(seats.get('s1')).toEqual({ status: 'confirmed', order: 1 });
    expect(seats.get('s5')).toEqual({ status: 'confirmed', order: 5 });
    expect(seats.get('s6')).toEqual({ status: 'waitlisted', order: 1 });
    expect(seats.get('s7')).toEqual({ status: 'waitlisted', order: 2 });
  });

  it('정원이 없으면(null) 전원 확정이다', () => {
    const seats = assignSeats(rows(50), null);
    expect([...seats.values()].every((s) => s.status === 'confirmed')).toBe(true);
    expect(seats.get('s50')!.order).toBe(50);
  });

  it('취소한 사람은 자리에서 빠지고 뒷사람이 자동으로 올라온다', () => {
    const list = rows(7);
    list[2]!.status = 'canceled'; // 3번째가 취소
    const seats = assignSeats(list, 5);
    expect(seats.has('s3')).toBe(false);
    expect(seats.get('s6')).toEqual({ status: 'confirmed', order: 5 }); // 대기 1번이 확정으로
    expect(seats.get('s7')).toEqual({ status: 'waitlisted', order: 1 });
  });

  it('정원을 줄이면 뒷사람이 대기로 내려간다(별도 코드 없이 재계산만으로)', () => {
    const seats = assignSeats(rows(5), 3);
    expect(seats.get('s4')).toEqual({ status: 'waitlisted', order: 1 });
    expect(seats.get('s5')).toEqual({ status: 'waitlisted', order: 2 });
  });

  it('입력 순서가 뒤섞여 있어도 seq 순서로만 판단한다', () => {
    const shuffled: SeatRow[] = [
      { id: 'c', seq: 3, status: 'waitlisted' },
      { id: 'a', seq: 1, status: 'waitlisted' },
      { id: 'b', seq: 2, status: 'confirmed' },
    ];
    const seats = assignSeats(shuffled, 2);
    expect(seats.get('a')).toEqual({ status: 'confirmed', order: 1 });
    expect(seats.get('b')).toEqual({ status: 'confirmed', order: 2 });
    expect(seats.get('c')).toEqual({ status: 'waitlisted', order: 1 });
  });

  it('취소 후 재신청은 새 번호라 대기 줄 맨 뒤로 간다', () => {
    // s2 가 취소했다가 seq 8 로 다시 신청한 상황.
    const list: SeatRow[] = [
      ...rows(7).filter((r) => r.id !== 's2'),
      { id: 's2', seq: 8, status: 'confirmed' },
    ];
    const seats = assignSeats(list, 5);
    expect(seats.get('s2')).toEqual({ status: 'waitlisted', order: 2 });
  });

  it('신청이 없으면 빈 배정이다', () => {
    expect(assignSeats([], 5).size).toBe(0);
  });
});

describe('상태 판정', () => {
  it('신청을 받는 것은 모집 중일 때뿐이다(마감·취소·승인 대기는 못 받는다)', () => {
    expect(acceptsSignups('open')).toBe(true);
    expect(acceptsSignups('closed')).toBe(false);
    expect(acceptsSignups('canceled')).toBe(false);
    expect(acceptsSignups('pending')).toBe(false);
    expect(acceptsSignups('rejected')).toBe(false);
  });

  it('게시판에 공개되는 것은 모집 중·마감뿐이다 — 승인 대기·거절 건은 부원에게 안 보인다', () => {
    expect(isPublicFlash('open')).toBe(true);
    expect(isPublicFlash('closed')).toBe(true);
    expect(isPublicFlash('pending')).toBe(false);
    expect(isPublicFlash('rejected')).toBe(false);
    expect(isPublicFlash('canceled')).toBe(false);
  });
});
