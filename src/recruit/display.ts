// 모집 화면들이 공유하는 표시 규칙(순수). 화면마다 따로 적으면 반드시 어긋난다 —
// 상태 라벨이 실제로 그렇게 어긋났다(status-label.ts 참고, 07-DECISIONS 34).

/**
 * 점수 표기. 집계가 돌려주는 평균은 number 라 9.0 이 `9` 로 찍혀,
 * 명단에서 `9점`과 `7.8점`이 섞여 자릿수가 흔들렸다. 항상 소수 첫째 자리까지 쓴다.
 * 점수가 없으면 null — 무엇으로 대신 쓸지(`-` / `미채점`)는 화면이 정한다.
 */
export function formatScore(value: number | null | undefined): string | null {
  return value === null || value === undefined || Number.isNaN(value) ? null : value.toFixed(1);
}

/** 서류 채점 인원 상태. '아무도 안 봤다'와 '적게 봤다'는 다른 사실이다. */
export type DocSampleState = 'unscored' | 'deficient' | 'ok';

/**
 * 예전에는 0명과 1~2명을 모두 "표본 부족(<3)"으로 묶었다. 그래서 안내 문구가
 * "N명이 3명 미만의 운영진에게만 채점받았습니다"가 됐는데, 0명은 **채점받은 적이 없다**.
 * 둘은 처방도 다르다 — 0명은 누군가 읽기라도 해야 하고, 1~2명은 표본을 늘려야 한다.
 */
export function docSampleState(scorerCount: number): DocSampleState {
  if (scorerCount <= 0) return 'unscored';
  if (scorerCount < 3) return 'deficient';
  return 'ok';
}

export interface SlotLike {
  venue?: string | null;
  link?: string | null;
  isRemote?: boolean | null;
}

/**
 * 면접 슬롯의 장소 표기.
 *
 * 예전에는 `slot.venue || '대면'` 이었다. 화면으로 만든 비대면 슬롯은 venue 에
 * '비대면 (온라인 화상)' 문자열이 들어가 가려졌지만, API 는 `isRemote:true` + `venue:null`
 * 조합을 그대로 받는다 — 그렇게 만들어진 비대면 슬롯이 **"대면"으로 표시됐다.**
 * 저장된 불리언을 믿고, venue 는 그 위에 덧붙이는 설명으로만 쓴다.
 */
export interface SlotForLabel extends SlotLike {
  id: string;
  startsAt: string | Date;
}

/**
 * 같은 시각·같은 장소에 슬롯을 여러 개 두는 것은 **정상 운영**이다 — 한 방에서 면접관 조를
 * 나눠 동시에 여러 명을 본다. 문제는 그 슬롯들의 이름이 완전히 같아서
 * "배정할 면접 슬롯" 드롭다운에 똑같은 줄이 두 개 뜨고, 어느 쪽을 고르는지 알 수 없던 것이다.
 *
 * → 같은 시각·같은 장소 묶음에 둘 이상이면 만든 순서대로 **1-based 조 번호**를 준다.
 *   묶음에 하나뿐이면 0(번호를 붙이지 않는다 — 대부분의 경우 군더더기다).
 */
export function slotPanelNumbers(slots: SlotForLabel[]): Record<string, number> {
  const groups = new Map<string, SlotForLabel[]>();
  for (const s of slots) {
    const t = new Date(s.startsAt).getTime();
    const key = `${Number.isNaN(t) ? String(s.startsAt) : t}|${slotPlaceLabel(s)}`;
    const group = groups.get(key);
    if (group) group.push(s);
    else groups.set(key, [s]);
  }

  const out: Record<string, number> = {};
  for (const group of groups.values()) {
    if (group.length < 2) {
      for (const s of group) out[s.id] = 0;
      continue;
    }
    // 만든 순서 = id 순이 아니라 배열에 들어온 순서(서버가 startsAt 오름차순으로 준다).
    group.forEach((s, i) => {
      out[s.id] = i + 1;
    });
  }
  return out;
}

/**
 * 드롭다운·카드에 쓸 슬롯 한 줄 설명.
 * 조 번호가 있으면 붙이고, 면접관을 알면 누가 보는 조인지까지 적는다 —
 * 조 번호만으로는 "1조가 누구지?"를 다시 찾아봐야 한다.
 */
export function slotPanelSuffix(panelNo: number, interviewers: string[] = []): string {
  if (panelNo <= 0) return '';
  const who = interviewers.filter(Boolean).join('·');
  return who ? ` · ${panelNo}조(${who})` : ` · ${panelNo}조`;
}

export function slotPlaceLabel(slot: SlotLike): string {
  const venue = slot.venue?.trim();
  if (slot.isRemote) {
    // '비대면 (온라인 화상)' 처럼 이미 비대면임을 말하고 있으면 그대로 쓴다.
    return venue && venue.includes('비대면') ? venue : venue ? `비대면 · ${venue}` : '비대면';
  }
  return venue || '대면';
}
