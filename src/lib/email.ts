// 이메일 주소 검증 — 순수 모듈(가입·로그인·모집 지원서 공용). `src/lib/phone.ts` 와 같은 자리다.
//
// ⚠ **이 검사는 보안 검사다.** 저장된 주소는 그대로 nodemailer 의 `to` 로 들어간다:
//   - 콤마·세미콜론으로 여러 주소를 이어 붙이면 지원서 한 건이 여러 명에게 나간다. 동아리 공용
//     Gmail 을 릴레이로 쓰는 셈이고, 그 하루 500통 한도는 **로그인·가입 인증 코드와 나눠 쓴다**
//     (result-mail-rules.ts DAILY_CAP 주석) — 통이 마르면 그날 아무도 로그인하지 못한다.
//   - 제어문자(CR/LF)가 섞이면 메일 헤더 인젝션이 된다(nodemailer 6.x 의 알려진 경로).
//
// 지원서 화면의 `<input type="email">` 은 검증이 아니다(규칙 #6 — 화면에서 막는 것은 검증이
// 아니다). 접수 라우트가 서버에서 막고, 발송 직전에 한 번 더 본다(그 전에 저장된 행이 있다).
//
// 정규식을 RFC 수준으로 늘리지 않는다: 목적은 "메일이 갈 수 있는 모양인가"가 아니라
// **"이 문자열이 주소 하나인가"** 이므로, 구분자로 쓰이는 문자를 막는 쪽이 본질이다.

/** RFC 상한. `http/input.ts` 의 LIMITS.email 과 같은 값이어야 한다. */
export const MAX_EMAIL_LENGTH = 254;

// 주소 구분자(`, ; < >`)와 따옴표를 명시적으로 배제한다 — 여러 수신자를 한 문자열에 담는 통로다.
const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

/**
 * 메일을 보내도 되는 주소 하나인가.
 *
 * `\s` 가 공백·개행을 이미 막지만 제어문자를 따로 훑는다: NUL(U+0000)·DEL(U+007F) 같은 문자는
 * `\s` 에 걸리지 않으면서 헤더를 깨뜨릴 수 있고, 정규식 문자클래스에 넣으면 lint 의
 * no-control-regex 에 걸려 예외 주석이 필요해진다. 한 번 훑는 편이 읽기도 낫다.
 */
export function isValidEmail(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const s = value.trim();
  if (!s || s.length > MAX_EMAIL_LENGTH) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return false;
  }
  return EMAIL_RE.test(s);
}

/** 비교·조회용 정규화(대소문자 무시). 저장 값의 표기는 바꾸지 않는다 — 화면에 적은 그대로 보인다. */
export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/** 두 주소가 같은 주소를 가리키는가(대소문자·앞뒤 공백 무시). */
export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeEmail(a) === normalizeEmail(b);
}
