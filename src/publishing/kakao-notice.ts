// 단톡 공지문 조립 — 카페 발행 뒤 팀장단이 단톡방에 올릴 문구를 만든다.
//
// 왜 문구만 주는가: **카카오톡에는 단톡방 자동 전송 API 가 없다**(2026-07 공식 문서 재확인).
// 비공식 자동화(LOCO·메신저봇류)는 약관 위반이라 CLAUDE.md 금지 #3 으로 막혀 있다. 그래서
// 시스템이 하는 일은 카톡의 **예약 메시지** 기능을 사람이 쓰도록 완성된 문구와 시각을 건네는 것뿐이다.
//
// 이 파일은 순수 함수만 둔다(env·DB·브라우저 API 없음) — 서버와 클라이언트가 같이 import 한다.

/** 카톡 예약 시각 = 카페 발행 시각 + 이만큼. 카페에 글이 올라간 뒤 알림이 가야 한다. */
export const KAKAO_LEAD_MINUTES = 1;

// 문구는 여기만 고치면 된다. 자리표시자는 `{키}` 한 겹 — 카페 본문의 `{{키}}`(사용자가 직접 쓰는
// 플레이스홀더)와 헷갈리지 않게 일부러 다른 모양을 쓴다. 이 문자열은 사용자에게 노출되지 않는다.
export const KAKAO_NOTICE_TEMPLATE = `안녕하세요, {팀명} 팀장단입니다.

{간결_날짜} {봉사_장소} 봉사 공지 업로드 되었습니다.

많은 참여 부탁드립니다!

{게시판_url}`;

/**
 * 봉사 회차가 없거나(일반 공지) 날짜·장소가 아직 비었을 때 쓰는 축약형.
 * 팀명 대신 **글 제목**으로 무슨 공지인지 알린다 — 일반 공지는 총회·모집처럼 팀이 없는 것이 많다.
 */
export const KAKAO_NOTICE_TEMPLATE_SHORT = `안녕하세요

{제목} 업로드 되었습니다.

{게시판_url}`;

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

/** KST 기준 달력 값. Date 를 브라우저 시간대에 맡기지 않는다(휴대폰 시간대가 달라도 같은 문구가 나와야 한다). */
function kstParts(d: Date): { y: number; mo: number; day: number; wd: string; hh: string; mm: string } {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return {
    y: k.getUTCFullYear(),
    mo: k.getUTCMonth() + 1,
    day: k.getUTCDate(),
    wd: WEEKDAY[k.getUTCDay()]!,
    hh: String(k.getUTCHours()).padStart(2, '0'),
    mm: String(k.getUTCMinutes()).padStart(2, '0'),
  };
}

/**
 * 'YYYY-MM-DD' → "8/9(토)". 형식이 아니면 null.
 *
 * 카페 본문의 `{{간결_날짜}}`("08/09 토요일")와 **모양이 다르다** — 카톡 한 줄에 장소까지 들어가므로
 * 짧은 쪽이 읽힌다. 두 곳이 같아야 할 이유가 없어 각자 쓰기 좋은 모양을 쓴다.
 */
export function shortDateLabel(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const wd = WEEKDAY[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()]!;
  return `${mo}/${d}(${wd})`;
}

/**
 * 카톡 예약 메시지에 넣을 시각 = 발행 시각 + 1분 → "8/5(화) 13:01" (KST).
 * 발행 시각이 미정이면 null.
 */
export function kakaoReserveLabel(publishAt: Date | string | null | undefined): string | null {
  if (!publishAt) return null;
  const d = publishAt instanceof Date ? publishAt : new Date(publishAt);
  if (Number.isNaN(d.getTime())) return null;
  const at = new Date(d.getTime() + KAKAO_LEAD_MINUTES * 60_000);
  const p = kstParts(at);
  return `${p.mo}/${p.day}(${p.wd}) ${p.hh}:${p.mm}`;
}

export interface KakaoNoticeInput {
  /** 예약 제목(플레이스홀더는 치환된 상태로 넘긴다). 축약형에서 "무슨 공지인지"를 담당한다. */
  title?: string | null;
  /** 예약의 소유 팀 이름. 개인 소유(일반 공지)면 null → 축약형. */
  teamName?: string | null;
  /** 봉사 회차 일자 'YYYY-MM-DD'. 없으면 축약형. */
  eventDate?: string | null;
  /** 봉사 장소. 없으면 축약형. */
  place?: string | null;
  /** 카페 게시판 주소. 없으면 마지막 줄을 통째로 뺀다. */
  boardUrl?: string | null;
}

/**
 * 단톡방에 붙여 넣을 공지문 전문. 빈 줄을 포함한 줄바꿈은 템플릿 그대로 나간다
 * (복사 → 카톡 붙여넣기까지 그 모양이 유지되어야 한다).
 *
 * 글 주소가 아니라 **게시판 주소**를 쓴다 — 카페 글 번호는 실제로 올라가는 순간 네이버가 매기므로
 * 예약 시점에는 알 수 없다(글쓰기 API 에 번호 지정·조회 수단이 없고, 카페를 읽는 것은 금지 #1).
 */
export function buildKakaoNotice(input: KakaoNoticeInput): string {
  const team = input.teamName?.trim() ?? '';
  const date = shortDateLabel(input.eventDate);
  const place = input.place?.trim() ?? '';

  // 팀·날짜·장소가 **모두** 있을 때만 봉사 문장을 쓴다. 하나라도 비면 "8/9(토)  봉사 공지" 처럼
  // 구멍이 난 문장이 그대로 단톡방에 나간다 — 그럴 바엔 제목만 알리는 축약형이 낫다.
  const text =
    team && date && place
      ? KAKAO_NOTICE_TEMPLATE.replace('{팀명}', team).replace('{간결_날짜}', date).replace('{봉사_장소}', place)
      : KAKAO_NOTICE_TEMPLATE_SHORT.replace('{제목}', input.title?.trim() || '공지');

  const url = input.boardUrl?.trim() ?? '';
  // 주소가 없으면 마지막 줄과 그 앞 빈 줄까지 지운다(빈 줄로 끝나지 않게).
  return url ? text.replace('{게시판_url}', url) : text.replace(/\n*\{게시판_url\}/, '');
}
