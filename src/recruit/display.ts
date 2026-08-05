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
 * 한 시각에 슬롯을 여러 개 두는 것은 **정상 운영**이다 — 면접관 조를 나눠 동시에 여러 명을 본다.
 * 문제는 그 슬롯들을 시각만으로는 부를 수 없어서, "배정할 면접 슬롯" 드롭다운과 면접 콘솔의
 * 시간대 칩에 똑같아 보이는 항목이 여러 개 뜨고 어느 쪽인지 알 수 없던 것이다.
 *
 * → **같은 시각** 묶음에 둘 이상이면 만든 순서대로 **1-based 조 번호**를 준다.
 *   묶음에 하나뿐이면 0(번호를 붙이지 않는다 — 대부분의 경우 군더더기다).
 *
 * 장소는 묶음 기준에서 뺐다(2026-08-05). 예전에는 시각+장소가 같을 때만 번호를 매겨서,
 * **같은 시각에 방을 나눠 쓰면**(3층·4층 동시 진행) 양쪽 다 0번이 되어 이름이 겹친 채로 남았다.
 *
 * ⚠ 새 슬롯은 `panel` 컬럼(0026)이 조 이름을 직접 들고 있다. 이 함수는 그 컬럼이 비어 있는
 *   **옛 슬롯의 fallback 전용**이다 — 새 코드에서는 `slotPanelLabel` 을 부를 것.
 */
/**
 * 조 이름. `panel` 컬럼(0026)이 있으면 그대로 쓰고, 없으면 같은 시각 순번으로 임시 이름을 만든다.
 *
 * 조를 나누기 전에 만든 슬롯이 운영 DB 에 남아 있어서 fallback 이 필요하다. 임시 이름은
 * **A조가 한 시간대를 비우면 아래 시간대부터 밀린다** — 그래서 컬럼을 넣었다. 새 슬롯에는 쓰이지 않는다.
 */
export function slotPanelLabel(
  slot: { id: string; panel?: string | null },
  fallbackNumbers: Record<string, number> = {}
): string {
  const named = slot.panel?.trim();
  if (named) return named;
  const n = fallbackNumbers[slot.id] ?? 0;
  return n > 0 ? `${n}조` : '';
}

/**
 * 다음에 만들 조 이름을 제안한다(A조 → B조 → C조 …).
 *
 * 조 구성은 기수마다 다르다 — 대면만 3개일 수도 있고 비대면이 없을 수도 있다. 그래서 이름은
 * **자유 입력**이고 여기서는 거들기만 한다. 기본값을 늘 'A조'로 두면 두 번째 조를 만들 때마다
 * 지우고 다시 쓰게 되고, 그대로 누르면 "이미 있는 이름"에서 막힌다.
 *
 * 이미 쓰는 이름은 건너뛴다(A조·C조 가 있으면 B조를 제안). Z조까지 찼거나 이름 규칙이 다르면
 * 빈 문자열을 돌려준다 — 그때는 사람이 직접 쓴다(억지로 지어내면 이상한 이름이 기본값이 된다).
 */
export function suggestNextPanelName(existing: string[]): string {
  const taken = new Set(existing.map((n) => n.trim()).filter(Boolean));
  for (let i = 0; i < 26; i++) {
    const name = `${String.fromCharCode(65 + i)}조`;
    if (!taken.has(name)) return name;
  }
  return '';
}

export function slotPanelNumbers(slots: SlotForLabel[]): Record<string, number> {
  const groups = new Map<string, SlotForLabel[]>();
  for (const s of slots) {
    const t = new Date(s.startsAt).getTime();
    const key = Number.isNaN(t) ? String(s.startsAt) : String(t);
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
export function slotPanelSuffix(panelLabel: string, interviewers: string[] = []): string {
  const name = panelLabel.trim();
  if (!name) return '';
  const who = interviewers.filter(Boolean).join('·');
  return who ? ` · ${name}(${who})` : ` · ${name}`;
}

export function slotPlaceLabel(slot: SlotLike): string {
  const venue = slot.venue?.trim();
  if (slot.isRemote) {
    // '비대면 (온라인 화상)' 처럼 이미 비대면임을 말하고 있으면 그대로 쓴다.
    return venue && venue.includes('비대면') ? venue : venue ? `비대면 · ${venue}` : '비대면';
  }
  return venue || '대면';
}
