import { describe, it, expect } from 'vitest';
import { publishVars, renderFinal, usedPlaceholders } from './final-render';
import { placeholderKeys, renderTemplate } from './template-render';
import type { events } from '@/db/schema';

type EventRow = typeof events.$inferSelect;

// 회차 한 건(장소/정원까지 채워진 상태)을 만든다. 개별 필드는 테스트마다 덮어쓴다.
function makeEvent(patch: Partial<EventRow> = {}): EventRow {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    teamId: '00000000-0000-0000-0000-000000000002',
    ruleId: null,
    title: '정기 봉사',
    eventDate: '2026-07-23',
    meetTime: '14:00:00',
    place: '양주 쉼터',
    capacity: 20,
    status: 'draft',
    createdAt: new Date('2026-07-01T00:00:00Z'),
    ...patch,
  };
}

describe('publishVars — 발행 직전 치환 변수', () => {
  it('회차의 일시·장소·정원과 팀장단 명단을 모두 변수로 만든다', () => {
    expect(publishVars(makeEvent(), '팀장 홍길동 010-0000-0000')).toEqual({
      간결_날짜: '07/23',
      전체_날짜: '2026년 7월 23일 목요일',
      집합시간: '14:00', // 'HH:MM:SS' → 'HH:MM'
      장소: '양주 쉼터',
      정원: '20',
      팀장단: '팀장 홍길동 010-0000-0000',
    });
  });

  it('빈 장소·정원은 변수에 넣지 않는다(미치환으로 남겨 발행을 막기 위해)', () => {
    const vars = publishVars(makeEvent({ place: '   ', capacity: null }), '');
    expect(vars['장소']).toBeUndefined();
    expect(vars['정원']).toBeUndefined();
    expect(vars['팀장단']).toBeUndefined();
  });

  it('일반 공지(event 없음)는 빈 변수', () => {
    expect(publishVars(null, '')).toEqual({});
  });
});

describe('renderFinal — 최종 본문 + 미치환 키', () => {
  const post = {
    title: '{{간결_날짜}} 정기 봉사 안내',
    contentMd: '{{전체_날짜}} 봉사\n집합 {{집합시간}} / 장소 {{장소}} / 정원 {{정원}}\n\n문의:\n{{팀장단}}',
  };

  it('값이 모두 있으면 치환 완료 + 미치환 없음', () => {
    const r = renderFinal(post, publishVars(makeEvent(), '팀장 홍길동'));
    expect(r.title).toBe('07/23 정기 봉사 안내');
    expect(r.contentMd).toContain('장소 양주 쉼터 / 정원 20');
    expect(r.contentMd).toContain('팀장 홍길동');
    expect(r.unresolved).toEqual([]);
  });

  it('장소·정원이 비면 플레이스홀더가 남고 미치환으로 보고된다(발행 차단 근거)', () => {
    const r = renderFinal(post, publishVars(makeEvent({ place: null, capacity: null }), '팀장 홍길동'));
    expect(r.contentMd).toContain('장소 {{장소}} / 정원 {{정원}}');
    expect(r.unresolved).toEqual(['장소', '정원']);
  });

  it('회차별로 장소를 바꾸면 본문 수정 없이 최종본만 바뀐다', () => {
    const r = renderFinal(post, publishVars(makeEvent({ place: '파주 쉼터' }), ''));
    expect(r.contentMd).toContain('장소 파주 쉼터');
    expect(r.unresolved).toEqual(['팀장단']); // 팀장단 미등록이면 이것도 발행 차단 대상
  });
});

describe('usedPlaceholders — 예약 큐·수정 화면의 "이렇게 바뀝니다" 목록', () => {
  const post = { title: '{{간결_날짜}} 봉사', contentMd: '정원 {{정원}}명 / 문의 {{팀장단}}' };

  it('쓰는 키마다 들어갈 값을 등장 순서대로 돌려준다', () => {
    const vars = publishVars(makeEvent(), '팀장 홍길동');
    expect(usedPlaceholders(post, vars)).toEqual([
      { key: '간결_날짜', value: '07/23' },
      { key: '정원', value: '20' },
      { key: '팀장단', value: '팀장 홍길동' },
    ]);
  });

  it('값이 없는 키는 null 로 표시한다(화면에서 "비어 있음" 경고)', () => {
    const vars = publishVars(makeEvent({ capacity: null }), '');
    const byKey = new Map(usedPlaceholders(post, vars).map((u) => [u.key, u.value]));
    expect(byKey.get('정원')).toBeNull();
    expect(byKey.get('팀장단')).toBeNull();
    expect(byKey.get('간결_날짜')).toBe('07/23');
  });
});

describe('placeholderKeys', () => {
  it('제목·본문을 함께 훑고 중복 키는 한 번만 보고한다', () => {
    expect(placeholderKeys('{{장소}}', '{{장소}} / {{정원}}')).toEqual(['장소', '정원']);
  });

  it('공백을 넣은 표기도 같은 키로 인식한다(renderTemplate 와 동일 규칙)', () => {
    expect(placeholderKeys('{{ 장소 }}')).toEqual(['장소']);
    expect(renderTemplate('{{ 장소 }}', { 장소: '양주 쉼터' })).toBe('양주 쉼터');
  });

  it('플레이스홀더가 없으면 빈 배열', () => {
    expect(placeholderKeys('일반 공지 본문', null, undefined)).toEqual([]);
  });
});
