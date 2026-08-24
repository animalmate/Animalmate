// 등록된 봉사 회차가 없을 때 챗봇이 안내할 **기본 문구**.
//
// 왜 코드 상수가 아니라 설정값인가: 이 문장은 동아리 운영 방식이지 프로그램의 동작이 아니다
// ("월요일에 단톡 공지 → 화요일에 신청" 같은 것은 기수마다 바뀐다). 코드에 박아 두면 바꾸려고
// 개발자를 불러야 한다. `app_settings` 에 두고 회장단이 챗봇 설정 화면에서 고친다(결정 3 과 같은 이유).
//
// 왜 문서(RAG)가 아니라 설정값인가: 문서는 **검색에 걸려야** 쓰인다. 이 문구는 "회차가 없다"는
// 상황에서 **반드시** 나가야 하는 안내라, 검색 운에 맡길 수 없다. 그래서 tool 결과에 직접 실어 보낸다.

import type { Database } from '@/db/types';
import { getSettings } from './settings';

export const VOLUNTEER_FALLBACK_KEY = 'chatbot_volunteer_fallback';

/**
 * 회장단이 아직 아무것도 적지 않았을 때 쓰는 기본값.
 * 실제 운영 방식(2026-08 기준 — 신청은 카페 댓글, 확정은 팀장단 수동)에 맞춰 써 두었다.
 */
export const DEFAULT_VOLUNTEER_FALLBACK =
  '아직 확정된 봉사 일정은 없어요. 봉사가 있는 주에는 팀장단이 단톡방에 공지를 올리니 그 공지를 확인해 주세요. 신청은 네이버 카페 공지 글의 댓글로 합니다.';

/** 너무 길면 답변이 안내문에 잡아먹힌다. 화면과 서버 양쪽에서 같은 값으로 자른다. */
export const MAX_FALLBACK_CHARS = 500;

export async function getVolunteerFallback(db: Database): Promise<string> {
  const s = await getSettings(db, [VOLUNTEER_FALLBACK_KEY]);
  const v = s[VOLUNTEER_FALLBACK_KEY];
  const text = typeof v === 'string' ? v.trim() : '';
  return text || DEFAULT_VOLUNTEER_FALLBACK;
}
