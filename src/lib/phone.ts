// 연락처(전화번호) 정규화·검증·표시 — 순수 모듈(가입·본인수정·팀장단 공용, 클라이언트 겸용).

/** 숫자만 남긴다('010-1234-5678' → '01012345678'). */
export function phoneDigits(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '');
}

/** 한국 전화번호로 볼 수 있는가 — 0 으로 시작하는 9~11자리(휴대폰·유선 포함). 빈 값은 false. */
export function isValidPhone(s: string | null | undefined): boolean {
  const d = phoneDigits(s);
  return d.length >= 9 && d.length <= 11 && d.startsWith('0');
}

/** 저장·표시용 정규화 — 하이픈으로 끊어 준다(휴대폰 010-1234-5678, 그 외는 최선 표기). 형식이 아니면 입력 그대로 trim. */
export function formatPhone(s: string | null | undefined): string {
  const d = phoneDigits(s);
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return d.startsWith('02') ? `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return (s ?? '').trim();
}
