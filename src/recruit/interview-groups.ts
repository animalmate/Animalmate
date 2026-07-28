// 면접 당일 콘솔용 — 지원자를 **같이 들어가는 슬롯 단위**로 묶는다.
//
// 왜 필요한가: 한 슬롯에 여러 명을 동시에 본다(예: 권예준·김서준·류도윤을 한 조가 함께 면접).
// 목록이 평면이면 면접관은 "지금 이 방에 누가 들어와 있는지"를 이름 하나하나 눌러 확인해야 한다.
// 묶어서 보여주면 그 조를 통째로 보고 사람만 바꿔 가며 채점할 수 있다.

export interface GroupSlot {
  id: string;
  startsAt: string | Date;
  durationMin?: number | null;
  venue?: string | null;
  isRemote?: boolean | null;
}

export interface InterviewGroup<A> {
  /** null 이면 '슬롯 미배정' 묶음. */
  slotId: string | null;
  startsAtMs: number | null;
  durationMin: number | null;
  placeLabel: string | null;
  /** 같은 시각·같은 장소를 나눠 쓰는 조 번호(1-based). 하나뿐이면 0. */
  panelNo: number;
  interviewers: string[];
  applicants: A[];
  /** 지금 진행 중인 시간대인가(면접 당일 화면에서 강조). */
  isNow: boolean;
}

export function groupApplicantsBySlot<A extends { id: string; slotId?: string | null }>({
  slots,
  applicants,
  interviewersBySlot = {},
  panelNumbers = {},
  placeLabel,
  nowMs,
}: {
  slots: GroupSlot[];
  applicants: A[];
  interviewersBySlot?: Record<string, string[]>;
  panelNumbers?: Record<string, number>;
  placeLabel: (slot: GroupSlot) => string;
  /** 없으면 '지금' 판정을 하지 않는다(테스트·서버 렌더에서 시간에 흔들리지 않게). */
  nowMs?: number;
}): InterviewGroup<A>[] {
  // 배정된 슬롯이 실제로 존재하는지까지 본다. 슬롯을 지웠는데 배정이 남아 있으면
  // 그 지원자는 어느 묶음에도 못 들어가 **목록에서 통째로 사라진다**(면접 당일에 사람이
  // 증발한다). 그런 사람은 미배정으로 내려 보낸다.
  const knownSlotIds = new Set(slots.map((s) => s.id));

  const bySlot = new Map<string, A[]>();
  const unassigned: A[] = [];
  for (const a of applicants) {
    if (!a.slotId || !knownSlotIds.has(a.slotId)) {
      unassigned.push(a);
      continue;
    }
    const list = bySlot.get(a.slotId);
    if (list) list.push(a);
    else bySlot.set(a.slotId, [a]);
  }

  const groups: InterviewGroup<A>[] = slots
    .map((slot) => {
      const startsAtMs = new Date(slot.startsAt).getTime();
      const durationMin = slot.durationMin ?? 30;
      const valid = !Number.isNaN(startsAtMs);
      return {
        slotId: slot.id,
        startsAtMs: valid ? startsAtMs : null,
        durationMin,
        placeLabel: placeLabel(slot),
        panelNo: panelNumbers[slot.id] ?? 0,
        interviewers: interviewersBySlot[slot.id] ?? [],
        applicants: bySlot.get(slot.id) ?? [],
        isNow:
          valid && nowMs !== undefined && nowMs >= startsAtMs && nowMs < startsAtMs + durationMin * 60_000,
      };
    })
    // 깨진 시각의 슬롯은 순서를 정할 수 없다 — 뒤로 민다(감추지는 않는다).
    .sort((a, b) => (a.startsAtMs ?? Infinity) - (b.startsAtMs ?? Infinity));

  // 배정을 못 받은 사람은 맨 뒤에 따로 둔다. 목록에서 빼면 잊힌다.
  if (unassigned.length > 0) {
    groups.push({
      slotId: null,
      startsAtMs: null,
      durationMin: null,
      placeLabel: null,
      panelNo: 0,
      interviewers: [],
      applicants: unassigned,
      isNow: false,
    });
  }

  return groups;
}
