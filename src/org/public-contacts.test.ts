import { describe, expect, it } from 'vitest';
import { tidyNames, pickOutreachLead, OUTREACH_TEAM_NAME } from './public-contacts';

// 이 화면은 로그인 없이 누구나 보는 표면이라, 잘못된 이름이 올라가면 되돌릴 방법이 없다
// (검색엔진 캐시에 남는다). 그래서 "무엇을 버리는가"를 특히 촘촘히 고정한다.
//
// ⚠ **개발자(sysadmin)를 빼는 것은 여기서 테스트하지 않는다.** 그 판단은 순수 함수가 아니라
//    `loadPublicContacts` 의 SQL `where role = 'board'` 에 있다. 화면 워크스루가 실제로 확인한다
//    (권한 등급이 같은 sysadmin 을 `isPrivileged` 로 물으면 개발자가 명단에 끼어 들어온다).

describe('tidyNames', () => {
  it('가나다순으로 세운다 — DB 가 준 순서를 따르지 않는다', () => {
    expect(tidyNames([{ name: '하늘' }, { name: '가온' }, { name: '나래' }])).toEqual([
      '가온',
      '나래',
      '하늘',
    ]);
  });

  it('빈 이름과 공백뿐인 이름은 버린다', () => {
    expect(tidyNames([{ name: '' }, { name: '   ' }, { name: '김회장' }])).toEqual(['김회장']);
  });

  it('앞뒤 공백을 다듬는다', () => {
    expect(tidyNames([{ name: ' 김회장 ' }])).toEqual(['김회장']);
  });

  it('아무도 없으면 빈 배열 — 화면이 그 줄을 통째로 뺀다', () => {
    expect(tidyNames([])).toEqual([]);
  });

  it('동명이인은 둘 다 남긴다 — 실제로 두 사람이므로 하나로 합치면 한 명이 사라진다', () => {
    expect(tidyNames([{ name: '김하늘' }, { name: '김하늘' }])).toEqual(['김하늘', '김하늘']);
  });
});

describe('pickOutreachLead', () => {
  it('팀장단이 여럿이어도 대표 한 명만(팀장 → 부팀장 순)', () => {
    expect(
      pickOutreachLead([
        { label: '부팀장', name: '가부팀' },
        { label: '팀장', name: '하팀장' },
      ])
    ).toEqual({ label: `${OUTREACH_TEAM_NAME} 팀장`, names: ['하팀장'] });
  });

  it('같은 직함이면 이름 가나다순으로 고른다(고르는 기준이 매 요청 흔들리지 않게)', () => {
    const out = pickOutreachLead([
      { label: '팀장', name: '하팀장' },
      { label: '팀장', name: '가팀장' },
    ]);
    expect(out?.names).toEqual(['가팀장']);
  });

  it('직함이 비어 있으면 "팀장단"으로 적는다 — 없는 직함을 지어내지 않는다', () => {
    expect(pickOutreachLead([{ label: null, name: '아무개' }])).toEqual({
      label: `${OUTREACH_TEAM_NAME} 팀장단`,
      names: ['아무개'],
    });
  });

  it('팀장단이 없으면 null — 화면에서 그 줄이 사라진다', () => {
    expect(pickOutreachLead([])).toBeNull();
    expect(pickOutreachLead([{ label: '팀장', name: '  ' }])).toBeNull();
  });
});
