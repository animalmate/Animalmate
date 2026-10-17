// 공용 메모지 키 규칙(순수). notes.ts 는 db/client 를 import 하므로 여기에 따로 둔다.
//
// 예전 키는 화면당 하나였다('recruit:doc'). 그래서 기수가 바뀌어도 지난 기수 메모가 그대로 남고,
// 폐기해도 지워지지 않았다 — 운영진이 메모지에 지원자 실명을 적는다는 걸 생각하면 PII 가 남는 셈이다.
// 이제 기수와 팀을 키에 넣어, 팀별로 따로 쓰고 기수 폐기 때 통째로 지운다.

/** 팀을 고르지 않았을 때(전체 보기) 쓰는 메모지. */
export const ALL_TEAMS = 'ALL';

/**
 * 메모지 키. 기수를 앞에 두어 폐기 시 접두사 하나로 전부 지울 수 있게 한다.
 * 팀 이름은 맨 뒤에 둔다 — 팀 이름에 콜론이 들어와도 앞쪽 구조가 깨지지 않는다.
 */
export function buildNoteKey(cohortId: string, screen: string, team: string = ALL_TEAMS): string {
  return `recruit:${cohortId}:${screen}:${team || ALL_TEAMS}`;
}

/** 해당 기수의 모든 메모지를 고르는 LIKE 패턴(폐기용). */
export function cohortNoteKeyPrefix(cohortId: string): string {
  return `recruit:${cohortId}:%`;
}

/** 메모지 키 길이 상한. 팀 이름(LIMITS.name 100) + 기수 id + 화면 이름이 넉넉히 들어간다. */
export const MAX_NOTE_KEY_LENGTH = 300;

const NOTE_KEY_RE = /^recruit:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[a-z0-9-]+:.+$/i;

/**
 * buildNoteKey 가 만든 모양인가(서버가 받는 키 검사).
 *
 * 메모지는 **기수 접두사로 폐기된다**(cohortNoteKeyPrefix). 그런데 API 가 키를 아무 문자열이나 받아,
 * 접두사 밖에 쓴 메모('recruit:doc' 같은 옛 키, 임의 문자열)는 기수를 폐기해도 영원히 남았다 —
 * 운영진이 메모지에 지원자 실명을 적는다는 것을 생각하면 "모두 폐기" 고지를 어기는 구멍이다
 * (2026-10-17 보안 감사). 화면이 만드는 키만 받는다.
 */
export function isValidNoteKey(key: unknown): key is string {
  return typeof key === 'string' && key.length <= MAX_NOTE_KEY_LENGTH && NOTE_KEY_RE.test(key);
}
