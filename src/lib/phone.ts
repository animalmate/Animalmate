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

/**
 * 밖에서 들여온 번호(구글 폼 CSV 업로드)를 저장 형태(숫자만)로 맞춘다.
 *
 * 왜 필요한가: 지원서는 "-" 없이 숫자만 받지만, 응답 **스프레드시트를 거쳐** 내려받으면
 * "01012345678" 이 수(number)로 해석돼 앞의 0 이 떨어진 "1012345678" 로 나온다. 그대로 저장하면
 * 지원자가 자기 번호로 결과를 조회할 때 아무것도 못 찾는다 — 조회는 이름+전화 **완전 일치**이고
 * (lookup.ts), 그 사람은 지원한 적 없는 사람이 된다. 중복 검사도 같은 사람을 놓친다.
 *
 * 되돌리는 경우는 확실한 둘뿐이다. 한국 번호는 반드시 0 으로 시작하므로 "10…" 10자리는
 * 앞 0 이 떨어진 휴대폰 번호로 볼 수밖에 없고, 국가번호 82 도 마찬가지다.
 * 그 밖에 애매한 값은 숫자만 남기고 그대로 둔다 — 추측으로 남의 번호를 만들지 않는다.
 */
export function normalizeImportedPhone(s: string | null | undefined): string {
  const d = phoneDigits(s);
  // 국가번호 표기(+82 10-1234-5678 / +82 010-…) → 앞자리 0 을 되살린다.
  if (d.startsWith('82') && d.length >= 11) {
    const rest = d.slice(2);
    return rest.startsWith('0') ? rest : `0${rest}`;
  }
  // 시트가 떼어먹은 휴대폰 앞 0.
  if (d.length === 10 && d.startsWith('10')) return `0${d}`;
  return d;
}
