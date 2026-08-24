// 3단 폴백의 **안전장치**를 지킨다.
//
// 회차 → 가이드북 → 기본 안내로 넘어가는 흐름은 모델이 판단하는 부분이라 단위 테스트로 못 박는다.
// 대신 그 흐름을 **가능하게 하는 조건**은 코드에 있고, 그게 깨지면 폴백이 통째로 죽는다:
// tool 이 빈 결과를 돌려줬을 때 근거 없음(핸드오프)으로 떨어뜨리지 않는 것.

import { describe, expect, it } from 'vitest';
import { toolGrounded, askChatbot, HANDOFF_MESSAGE } from './chatbot';
import { DEFAULT_VOLUNTEER_FALLBACK, MAX_FALLBACK_CHARS } from './volunteer-fallback';
import type { Actor } from '@/auth/permissions';
import type { Db } from '@/db/types';

const actor: Actor = { userId: 'u1', role: 'member', membershipActive: true, teams: [] };
const db = {} as Db; // deps 를 전부 주입하므로 DB 에 닿지 않는다

describe('toolGrounded', () => {
  it('회차가 있으면 근거', () => {
    expect(toolGrounded({ count: 2, sessions: [{}, {}] })).toBe(true);
  });

  it('회차가 0건이어도 noSessions 안내가 있으면 근거 — 이게 폴백의 생명줄이다', () => {
    expect(toolGrounded({ count: 0, sessions: [], noSessions: { fallbackNotice: '...' } })).toBe(true);
  });

  it('가이드북을 찾았으면 근거', () => {
    expect(toolGrounded({ found: true, content: '보통 토요일에 봉사를 엽니다.' })).toBe(true);
  });

  it('빈 결과에 안내도 없으면 근거가 아니다', () => {
    expect(toolGrounded({ count: 0, sessions: [] })).toBe(false);
    expect(toolGrounded({ found: false, content: null })).toBe(false);
  });
});

describe('회차가 없을 때 핸드오프로 떨어지지 않는다', () => {
  it('검색 결과가 0건이어도, 빈 회차 tool 의 안내만으로 답이 살아남는다', async () => {
    // 예전 판정(count>0 만 근거)이면 이 답은 통째로 HANDOFF_MESSAGE 로 덮여 사라졌다.
    const answer = '확정된 일정은 없지만 보통 토요일에 열려요. 봉사가 있는 주 월요일에 단톡방 공지를 확인해 주세요.';
    let round = 0;
    const result = await askChatbot(db, actor, '2팀 봉사 언제야?', {
      search: async () => [], // 문서 검색은 아무것도 못 찾은 상황
      execTool: async () => ({ count: 0, sessions: [], noSessions: { fallbackNotice: DEFAULT_VOLUNTEER_FALLBACK } }),
      generate: async () => {
        round += 1;
        return round === 1
          ? { text: '', functionCalls: [{ name: 'list_upcoming_volunteer_sessions', args: {} }], modelParts: [] }
          : { text: answer, functionCalls: [], modelParts: [] };
      },
    });
    expect(result.answer).toBe(answer);
    expect(result.handedOff).toBe(false);
  });

  it('tool 이 아무 근거도 못 주면 여전히 핸드오프한다(지어내기 방지는 그대로)', async () => {
    const result = await askChatbot(db, actor, '회비 얼마야?', {
      search: async () => [],
      execTool: async () => ({ count: 0, sessions: [] }),
      generate: async () => ({ text: '3만원입니다.', functionCalls: [], modelParts: [] }),
    });
    expect(result.answer).toBe(HANDOFF_MESSAGE);
    expect(result.handedOff).toBe(true);
  });
});

describe('기본 안내 문구', () => {
  it('기본값이 비어 있지 않고 상한 안에 든다', () => {
    expect(DEFAULT_VOLUNTEER_FALLBACK.length).toBeGreaterThan(20);
    expect(DEFAULT_VOLUNTEER_FALLBACK.length).toBeLessThanOrEqual(MAX_FALLBACK_CHARS);
  });
});
