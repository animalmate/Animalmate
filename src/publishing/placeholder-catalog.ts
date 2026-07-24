// 공지 양식에서 쓸 수 있는 플레이스홀더 목록 — 화면 안내문의 유일한 출처(순수 모듈, 클라이언트 공용).
//
// 장소는 여기 없다(2026-07-24 결정): 양식을 장소별로 따로 만들기 때문에 본문에 "양주 쉼터"처럼
// 그대로 적는 편이 읽기 쉽다. 회차 기록용 장소는 양식의 "봉사 장소" 값이 events.place 로 저장된다.

export interface PlaceholderInfo {
  key: string;
  /** 이 자리에 무엇이 들어가는지(짧게). */
  label: string;
  example: string;
  /** 값이 어디서 오는지 — 사용자가 어느 화면을 고쳐야 하는지 알려준다. */
  from: string;
}

export const PLACEHOLDERS: PlaceholderInfo[] = [
  { key: '간결_날짜', label: '봉사 날짜(짧게)', example: '07/23', from: '예약의 봉사 일자' },
  { key: '전체_날짜', label: '봉사 날짜(자세히)', example: '2026년 7월 23일 목요일', from: '예약의 봉사 일자' },
  { key: '집합시간', label: '집합 시간', example: '14:00', from: '예약의 집합 시간' },
  { key: '정원', label: '정원', example: '20명', from: '예약의 정원(없으면 양식 기본 정원)' },
  { key: '팀장단', label: '팀장단 연락처', example: '팀장 홍길동 010-0000-0000', from: '팀 관리 > 팀장단 명단' },
];

/** {{정원}} 에 들어갈 문구 — 숫자만 나오면 어색해서 단위까지 붙인다("20" → "20명"). */
export function capacityText(capacity: string | number): string {
  const s = String(capacity).trim();
  return s === '' ? '' : `${s}명`;
}

export function findPlaceholder(key: string): PlaceholderInfo | null {
  return PLACEHOLDERS.find((p) => p.key === key) ?? null;
}

/** 여러 줄·긴 값을 목록에 한 줄로 보여주기 위한 축약. */
export function shortenValue(value: string, max = 24): string {
  const firstLine = value.split('\n')[0] ?? '';
  const suffix = value.includes('\n') ? ' …' : '';
  return (firstLine.length > max ? `${firstLine.slice(0, max)}…` : firstLine) + suffix;
}
