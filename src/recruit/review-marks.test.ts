import { describe, it, expect } from 'vitest';
import {
  countReviewMarks,
  isReviewMark,
  nextReviewMark,
  normalizeMoveTeam,
  parseReviewMark,
  REVIEW_MARK_LABEL,
} from './review-marks';

describe('isReviewMark — 서버가 받는 값 거르기', () => {
  it('정해진 두 값만 통과시킨다', () => {
    expect(isReviewMark('drop')).toBe(true);
    expect(isReviewMark('move')).toBe(true);
  });

  it('그 밖의 값은 전부 막는다', () => {
    // 화면이 두 개만 보낸다는 것은 검증이 아니다 — 조작된 요청이 오는 자리다(규칙 #6).
    for (const bad of ['DROP', '탈락', 'final_fail', '', 0, true, {}, [], undefined]) {
      expect(isReviewMark(bad)).toBe(false);
    }
  });

  it('null 은 표시가 아니다 — 지우기는 parseReviewMark 쪽이 다룬다', () => {
    expect(isReviewMark(null)).toBe(false);
  });
});

describe('parseReviewMark — 표시 지정과 지우기를 가른다', () => {
  it('표시 두 값은 그대로 돌려준다', () => {
    expect(parseReviewMark('drop')).toBe('drop');
    expect(parseReviewMark('move')).toBe('move');
  });

  it('null 은 "표시를 지운다"는 정상 입력이다', () => {
    expect(parseReviewMark(null)).toBeNull();
  });

  it('알 수 없는 값은 undefined 로 돌려 호출부가 400 을 내게 한다', () => {
    // null 과 구분되어야 한다. 오타를 지우기로 읽으면 조용히 표시가 사라진다.
    expect(parseReviewMark('drops')).toBeUndefined();
    expect(parseReviewMark(undefined)).toBeUndefined();
  });
});

describe('nextReviewMark — 체크박스 두 개, 값은 하나', () => {
  it('아무 표시가 없으면 누른 표시가 붙는다', () => {
    expect(nextReviewMark(null, 'drop')).toBe('drop');
    expect(nextReviewMark(null, 'move')).toBe('move');
  });

  it('켜져 있는 것을 다시 누르면 꺼진다', () => {
    // 잘못 누른 사람이 제일 먼저 하는 행동이다. 여기서 안 꺼지면 표시가 박힌 줄 안다.
    expect(nextReviewMark('drop', 'drop')).toBeNull();
    expect(nextReviewMark('move', 'move')).toBeNull();
  });

  it('다른 쪽을 누르면 넘어간다 — 둘 다 켜지지 않는다', () => {
    expect(nextReviewMark('drop', 'move')).toBe('move');
    expect(nextReviewMark('move', 'drop')).toBe('drop');
  });
});

describe('countReviewMarks — 목록 위에 붙는 숫자', () => {
  it('표시별로 나눠 센다', () => {
    const counted = countReviewMarks([
      { reviewMark: 'drop' },
      { reviewMark: 'drop' },
      { reviewMark: 'move' },
      { reviewMark: null },
      {},
    ]);
    expect(counted).toEqual({ drop: 2, move: 1 });
  });

  it('아무도 표시되지 않았으면 0 이다 — 빈 값이 아니다', () => {
    // 화면이 `counts.drop > 0` 으로 분기하므로 키가 빠지면 안 된다.
    expect(countReviewMarks([{ reviewMark: null }])).toEqual({ drop: 0, move: 0 });
    expect(countReviewMarks([])).toEqual({ drop: 0, move: 0 });
  });
});

describe('REVIEW_MARK_LABEL — 화면과 도움말이 같은 말을 쓴다', () => {
  it('두 표시 모두 문구가 있다', () => {
    expect(REVIEW_MARK_LABEL.drop).toBe('탈락');
    expect(REVIEW_MARK_LABEL.move).toBe('다른 팀');
  });
});

describe('normalizeMoveTeam — 다른 팀 표시에 딸린 갈 팀', () => {
  it("'move' 일 때 고른 팀을 그대로 남긴다", () => {
    expect(normalizeMoveTeam('move', '봉사 2팀')).toBe('봉사 2팀');
  });

  it('안 고를 수 있다 — 빈 값은 null 이다', () => {
    // "우리 팀은 아니다"까지만 정하고 갈 곳은 나중에 맞추는 일이 흔하다.
    expect(normalizeMoveTeam('move', '')).toBeNull();
    expect(normalizeMoveTeam('move', '   ')).toBeNull();
    expect(normalizeMoveTeam('move', null)).toBeNull();
    expect(normalizeMoveTeam('move', undefined)).toBeNull();
  });

  it('앞뒤 공백은 떼고 남긴다 — 팀 필터가 문자열 일치로 걸린다', () => {
    expect(normalizeMoveTeam('move', ' 봉사 2팀 ')).toBe('봉사 2팀');
  });

  it("'move' 가 아니면 갈 팀은 없다", () => {
    // 탈락으로 바꿨는데 옛 목적지가 남으면 6번 화면에서 무엇을 믿을지 알 수 없다.
    expect(normalizeMoveTeam('drop', '봉사 2팀')).toBeNull();
    expect(normalizeMoveTeam(null, '봉사 2팀')).toBeNull();
  });

  it('문자열이 아닌 값은 팀 이름으로 받지 않는다', () => {
    for (const bad of [3, true, {}, ['봉사 2팀']]) {
      expect(normalizeMoveTeam('move', bad)).toBeNull();
    }
  });
});
