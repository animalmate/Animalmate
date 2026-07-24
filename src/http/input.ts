// 요청 본문 입력 한도 — 길이 제한이 없는 문자열 필드를 막는다.
//
// 왜: 운영진 계정 하나만 있으면 제목·본문·팀 이름 같은 text 컬럼에 수 MB 를 밀어 넣을 수 있었다.
// 무료 티어 DB 용량을 소진시키거나, 그대로 카페 공지로 나가거나, 목록 응답을 부풀려
// 화면을 마비시키는 데 쓰인다. 서버에서 자르지 말고 **거부**해야 사용자가 잘린 줄 모르고
// 공지를 내보내는 사고가 없다.

export const LIMITS = {
  title: 200,
  contentMd: 20_000, // 카페 공지 한 편 분량으로 충분
  name: 100, // 팀·양식·게시판 이름, 회원 이름
  purpose: 500,
  place: 200,
  semesterLabel: 50,
  email: 254, // RFC 상한
  phone: 30,
  label: 50, // 팀장단 직위
  question: 1000, // 챗봇 질문
} as const;

export class InputTooLongError extends Error {
  readonly status = 400;
  constructor(
    readonly field: string,
    readonly max: number
  ) {
    super(`${field} 은(는) ${max}자를 넘을 수 없습니다.`);
    this.name = 'InputTooLongError';
  }
}

/** 문자열 필드 길이 검사. 넘으면 InputTooLongError(400). */
export function checkLength(field: string, value: string | null | undefined, max: number): void {
  if (value != null && value.length > max) throw new InputTooLongError(field, max);
}

/** 'YYYY-MM-DDTHH:mm' 등 날짜 문자열 → Date. 파싱 불가면 null(잘못된 값이 DB 로 가지 않게). */
export function parseDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}
