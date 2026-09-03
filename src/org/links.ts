// 홈 화면 바로가기 링크 중 **기수마다 바뀌는 것**을 설정으로 뺀다(app_settings).
//
// 왜: 구글 드라이브 주소는 기수가 바뀔 때마다 새로 만들어진다. 코드에 박아 두면 학기마다
// 개발자를 불러 배포해야 한다 — 회장단이 스스로 바꿀 수 있어야 인수인계가 성립한다.
// 네이버 카페 주소는 동아리와 함께 고정이라 그대로 코드에 둔다(바뀔 일이 없다).

import type { Db, Database } from '@/db/types';
import type { Actor } from '@/auth/permissions';
import { getSettings, setSetting } from '@/rag/settings';

export const LINK_KEYS = {
  /** 홈 "구글 드라이브" 바로가기 주소. 비어 있으면 카드 자체를 숨긴다. **운영진 이상 전용.** */
  driveUrl: 'home_drive_url',
  /** 홈 "건의함" 바로가기(구글 폼). **부원 포함 전원**에게 보인다 — 의견을 내는 사람이 부원이다. */
  suggestUrl: 'home_suggest_url',
  /** 홈 "신고함" 바로가기(구글 폼). **부원 포함 전원**에게 보인다. */
  reportUrl: 'home_report_url',
} as const;

export type LinkKey = keyof typeof LINK_KEYS;
export interface HomeLinks {
  driveUrl: string | null;
  suggestUrl: string | null;
  reportUrl: string | null;
}

export class InvalidLinkError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidLinkError';
  }
}

/** 주소 길이 상한. 공유 링크는 길어도 이 안에 들어온다. */
export const MAX_LINK_LENGTH = 500;

/**
 * 입력값을 저장 가능한 주소로 정규화한다(순수 — 단위 테스트 대상).
 *
 * ⚠ **이 값은 화면에서 `<a href>` 로 나간다.** 그래서 스킴 검사가 보안 검사다 —
 * `javascript:` 를 넣으면 그 링크를 누른 사람의 브라우저에서 코드가 실행된다(XSS).
 * 회장단만 쓸 수 있는 값이라 해도, 화면에 그대로 꽂히는 입력은 서버에서 막는다(규칙 #6).
 *
 * @returns 정규화된 https 주소. 빈 입력이면 `null`(= 바로가기 숨김).
 */
export function normalizeLinkUrl(input: string | null | undefined): string | null {
  const s = String(input ?? '').trim();
  if (!s) return null; // 비우는 것은 정상 동작 — "이번 기수엔 드라이브 없음"
  if (s.length > MAX_LINK_LENGTH) throw new InvalidLinkError(`주소가 너무 깁니다(${MAX_LINK_LENGTH}자 이내).`);

  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new InvalidLinkError('주소 형식이 올바르지 않습니다. https:// 로 시작하는 전체 주소를 넣어 주세요.');
  }
  if (url.protocol !== 'https:') {
    // http: 도 막는다 — CSP 의 upgrade-insecure-requests 와 어긋나고, 굳이 허용할 이유가 없다.
    throw new InvalidLinkError('https:// 로 시작하는 주소만 넣을 수 있습니다.');
  }
  return url.toString();
}

const asUrl = (raw: unknown): string | null => (typeof raw === 'string' && raw.trim() ? raw : null);

/**
 * 홈 바로가기 주소 셋을 한 번에 읽는다. 없거나 비었으면 null(그 카드만 숨김).
 * 한 번의 조회로 끝내는 이유: 홈은 모든 사람이 여는 화면이라 왕복을 늘리지 않는다.
 */
export async function getHomeLinks(db: Database): Promise<HomeLinks> {
  const s = await getSettings(db, [LINK_KEYS.driveUrl, LINK_KEYS.suggestUrl, LINK_KEYS.reportUrl]);
  return {
    driveUrl: asUrl(s[LINK_KEYS.driveUrl]),
    suggestUrl: asUrl(s[LINK_KEYS.suggestUrl]),
    reportUrl: asUrl(s[LINK_KEYS.reportUrl]),
  };
}

/** 홈 바로가기 주소 읽기(드라이브 하나만 필요할 때). */
export async function getDriveUrl(db: Database): Promise<string | null> {
  return (await getHomeLinks(db)).driveUrl;
}

/**
 * 홈 바로가기 주소 저장(회장단 전용 — setSetting 이 권한·audit 을 함께 처리한다).
 *
 * **보낸 항목만** 손댄다(undefined = 그대로 둠, '' = 지움). 화면이 세 칸을 한 번에 저장하지만,
 * 부분 저장이 가능해야 나중에 칸이 늘어도 이 함수를 안 고친다.
 */
export async function setHomeLinks(
  db: Db,
  actor: Actor,
  input: Partial<Record<LinkKey, string | null>>
): Promise<HomeLinks> {
  for (const key of Object.keys(LINK_KEYS) as LinkKey[]) {
    if (input[key] === undefined) continue;
    await setSetting(db, actor, LINK_KEYS[key], normalizeLinkUrl(input[key]) ?? '');
  }
  return getHomeLinks(db);
}

/** 드라이브 주소만 저장. */
export async function setDriveUrl(db: Db, actor: Actor, input: string | null | undefined): Promise<string | null> {
  return (await setHomeLinks(db, actor, { driveUrl: input ?? '' })).driveUrl;
}
