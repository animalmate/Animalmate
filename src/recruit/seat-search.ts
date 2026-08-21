// 배정 칸에서 이름을 칠 때 뜨는 후보 순서 — 순수 규칙(부수효과 없음).
//
// 이 정렬이 곧 Enter 를 눌렀을 때 앉는 사람이다. 순서가 틀리면 **엉뚱한 사람이 배정되고**,
// 표에는 맞는 이름이 적혀 있으니 아무도 알아채지 못한다. 그래서 화면에서 떼어 내 시험한다.

export interface Candidate {
  id: string;
  name: string;
  team: string | null;
  /** 이미 앉아 있으면 그 슬롯 id. 미배정이면 null. */
  seatedSlotId: string | null;
  /** 앉아 있는 자리의 표시용 라벨('A조 13:00'). 미배정이면 null. */
  seatedAt: string | null;
  remote: boolean;
}

/** 공백을 걷어낸 비교용 키. '가 나다' 를 '가나다' 로 찾을 수 있게. */
const key = (s: string) => s.replace(/\s+/g, '');

/**
 * 친 글자에 맞는 후보를 **앉히고 싶을 법한 순서**로 돌려준다.
 *
 * 순서 규칙(위가 먼저):
 *  1. **미배정이 먼저.** 대부분은 빈 사람을 채우는 중이다. 이미 앉은 사람이 위에 오면
 *     Enter 를 눌렀을 때 남의 자리에서 사람을 빼 오게 된다.
 *  2. **이름 첫머리가 맞는 것이 먼저.** '가'를 치면 '가나다'가 '라가마'보다 먼저다.
 *  3. 나머지는 이름순 — 같은 글자를 쳤을 때 순서가 흔들리지 않아야 손이 기억한다.
 *
 * 지금 이 슬롯에 앉아 있는 사람은 아예 뺀다. 골라 봐야 제자리이고, 목록만 차지한다.
 */
export function rankCandidates(candidates: Candidate[], query: string, currentSlotId?: string): Candidate[] {
  const q = key(query.trim());
  if (!q) return [];

  return candidates
    .filter((c) => key(c.name).includes(q))
    .filter((c) => !(currentSlotId && c.seatedSlotId === currentSlotId))
    .sort((a, b) => {
      const seatDiff = Number(!!a.seatedSlotId) - Number(!!b.seatedSlotId);
      if (seatDiff !== 0) return seatDiff;
      const prefixDiff = Number(key(b.name).startsWith(q)) - Number(key(a.name).startsWith(q));
      if (prefixDiff !== 0) return prefixDiff;
      return a.name.localeCompare(b.name, 'ko');
    })
    // 목록이 길면 고르는 것이 아니라 읽는 일이 된다. 더 좁히려면 글자를 더 치면 된다.
    .slice(0, 8);
}
