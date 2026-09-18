// 기수의 지원자 공개 스위치 2개(면접 일정/링크, 최종 합격 결과) 사이의 관계를 한 곳에서 정한다.
//
// 왜 필요했나: 두 스위치를 독립으로 두었더니 **면접 공개 OFF + 최종 결과 공개 ON** 조합이
// 만들어졌고, 그 상태에서 `visibleLookupResult` 는 최종 결과가 없는 사람(서류 불합격·면접 불참)을
// 전부 `under_review` 로 되돌려 보여줬다. 지원자 화면에는 **이미 끝난 사람에게 "심사 중"** 이
// 떴다 — 조회 화면이 가장 하면 안 되는 거짓말이다.
//
// 규칙은 하나다: **최종 결과를 공개하려면 면접 일정/링크 공개가 켜져 있어야 한다.**
// 최종 결과 공개는 "모집 절차가 끝났다"는 발표이므로, 그 앞 단계(서류 결과·면접 단계)는
// 이미 공개돼 있어야 이야기가 맞는다.
//
// 순수 함수로 분리한 이유: 공개 범위 규칙은 권한 판단과 같은 급이라 단위 테스트로 고정한다
// (CLAUDE.md 코드 컨벤션 — visibility 필터는 단위 테스트 필수). 서버 라우트와 관리 화면 두 곳이
// 같은 함수를 부르므로 한쪽만 고쳐 어긋나는 일이 없다. 화면에서 막는 것은 공개 제어가 아니므로
// (규칙 #6) 최종 판단은 `resolvePublicSwitches` 를 부르는 **서버**가 한다.

export interface PublicSwitches {
  schedulePublic: boolean;
  resultPublic: boolean;
}

export type ResolveResult =
  | { ok: true; next: PublicSwitches }
  | { ok: false; message: string };

/**
 * 화면이 보낼 값을 규칙에 맞게 보정한다 — 최종 결과를 켜면 면접 공개도 함께 켠다.
 *
 * 막다른 골목을 만들지 않으려고 둔다: "면접 공개를 먼저 켜세요" 에러만 돌려주면, 결과를
 * 공개하려던 사람이 두 번 눌러야 한다. 대신 화면은 **함께 켜진다는 사실을 반드시 알린다**
 * (조용히 공개 범위가 넓어지면 안 된다).
 */
export function coercePublicSwitches(s: PublicSwitches): PublicSwitches {
  return s.resultPublic ? { schedulePublic: true, resultPublic: true } : s;
}

/**
 * 최종 결과 공개 중이라 면접 공개를 **끌 수 없는** 상태인가(체크박스 잠금 표시에 쓴다).
 *
 * 면접 공개가 이미 꺼진 채 결과만 켜져 있는 기수(이 규칙이 생기기 전에 저장된 값)는 잠그지
 * 않는다 — 거기서 잠가 버리면 고칠 길(면접 공개 켜기)까지 막혀 지원자 화면이 틀린 채로 남는다.
 */
export function isScheduleSwitchLocked(s: PublicSwitches): boolean {
  return s.resultPublic && s.schedulePublic;
}

/**
 * 현재 값 + 요청한 값 → 실제로 저장할 값. 규칙을 깨면 이유를 담아 거절한다.
 *
 * `undefined` 는 "안 바꿈" 이다(PATCH 의 부분 갱신 의미를 그대로 따른다). 그래서 면접 공개만
 * 끄는 요청도 **현재 결과 공개 값과 합쳐서** 판정한다 — 한 필드만 보면 규칙을 빠져나간다.
 */
export function resolvePublicSwitches(
  before: PublicSwitches,
  requested: { schedulePublic?: boolean; resultPublic?: boolean }
): ResolveResult {
  const next: PublicSwitches = {
    schedulePublic: requested.schedulePublic ?? before.schedulePublic,
    resultPublic: requested.resultPublic ?? before.resultPublic,
  };

  if (next.resultPublic && !next.schedulePublic) {
    // 같은 금지 조합이지만 사람이 하려던 일이 다르다 — 무엇을 하면 되는지로 문장을 나눈다.
    const message = before.resultPublic
      ? '최종 합격 결과를 공개하는 동안에는 면접 일정/링크 공개를 끌 수 없습니다. 면접 공개를 끄면 서류 불합격·면접 불참 지원자에게 "심사 중"으로 잘못 표시됩니다. 최종 결과 공개를 먼저 꺼 주세요.'
      : '최종 합격 결과를 공개하려면 면접 일정/링크 공개도 함께 켜야 합니다. 면접 공개가 꺼져 있으면 서류 불합격·면접 불참 지원자에게 "심사 중"으로 잘못 표시됩니다.';
    return { ok: false, message };
  }

  return { ok: true, next };
}
