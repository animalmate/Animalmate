/**
 * "가장 가까운 역" 칸에 **역명 대신 주소**를 적어 낸 값을 가려낸다.
 *
 * 왜 필요한가: 이 칸은 면접 배정(지역별 조 편성)에 쓰이는 값이라 역명이어야 쓸모가 있고,
 * 상세 주소는 필요 없는 개인정보다(스키마 주석 — "주소 대신 가장 가까운 역 명만 저장").
 * 업로드 미리보기가 "주소로 보이는 값이 N건"이라고 알려 주면 등록 전에 손볼 수 있다.
 *
 * 판정을 이 파일에 둔 이유: 예전에는 업로드 화면 안에 `/[시구동번지]/` 한 줄로 들어 있었다.
 * 그 규칙은 **역 이름을 주소로 오해**했고(`둔촌동역` 은 '동'을 포함한다) 정작 진짜 주소는
 * 미리보기 샘플 5행 밖이면 아무도 보지 못했다(33기 실제 1건). 화면과 서버가 같은 함수를 부르게
 * 하고, 규칙 자체는 단위 테스트로 고정한다.
 */

/** 역 이름으로 끝나면 역명이다 — `둔촌동역`, `종로3가역`, `고덕역 3번 출구`, `천호역(5호선)`. */
const STATION_TAIL = /역\s*(\d+\s*번?\s*출구)?\s*$|역\s*\([^)]*\)\s*$/;

/** 이것들이 보이면 역명이 아니라 주소다. 번지·도로명·건물번호·공동주택 이름. */
const ADDRESS_MARKS: RegExp[] = [
  /\d+\s*번지/,
  /\d+\s*번길/,
  /[로길]\s*\d+/, //  "천호대로 1234", "양재대로11길"
  /\d+\s*-\s*\d+/, // "123-4"
  /(아파트|빌라|오피스텔|맨션|타운|단지)/,
];

/**
 * 행정구역 낱말(…시/군/구/읍/면/동/리)을 센다.
 * 뒤에 다른 글자가 붙으면(`둔촌동역`) 세지 않는다 — 그래야 역명과 지명이 갈린다.
 */
function adminTokens(value: string): string[] {
  return value.match(/[가-힣]{1,10}(특별시|광역시|시|군|구|읍|면|동|리)(?=\s|$|\d|,)/g) ?? [];
}

/**
 * 주소로 보이는 값인가.
 *
 * 애매한 쪽은 **역명으로 본다**(= false). 이 경고는 사람에게 손볼 거리를 알려 주는 것이지
 * 등록을 막지 않으므로, 헛경보가 쌓이면 진짜 한 건이 묻힌다.
 */
export function looksLikeAddress(value?: string | null): boolean {
  const s = (value ?? '').trim();
  if (!s) return false;
  if (STATION_TAIL.test(s)) return false;
  if (ADDRESS_MARKS.some((re) => re.test(s))) return true;

  const admin = adminTokens(s);
  // 행정구역이 두 단계 이상 이어지면 주소다 — "서울시 강동구", "경기도 고양시 일산동구".
  if (admin.length >= 2) return true;
  // 한 단계뿐이면 지명일 수도 있다("둔촌동"). 숫자가 붙어야 상세 주소로 본다("둔촌동 123").
  return admin.length === 1 && /\d/.test(s);
}

/** 주소로 보이는 값을 전 행에서 센다. 미리보기 샘플이 아니라 등록될 전부를 본다. */
export function countAddressLike<T extends { nearStation?: string | null }>(
  applicants: T[]
): number {
  return applicants.filter((a) => looksLikeAddress(a.nearStation)).length;
}
