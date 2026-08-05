// 운영진 시간표 — "누가 언제 어디서 무엇을 맡는가" 한 장(순수 규칙, DB·부수효과 없음).
//
// 면접 시간표(`timetable.ts`)와 **다른 표다.** 저것은 조마다 표를 하나씩 만들고 면접자 이름까지
// 적는 공지용 표라, 조가 늘어날수록 표가 세로로 길어져 "내가 몇 시에 어디인지"를 찾으려면
// 표 여러 개를 오르내려야 한다. 이 표는 지원자를 빼는 대신 **조를 열로 세워** 하루를 한 장에 담는다.
// 운영진이 이 팝업에서 알고 싶은 것은 딱 두 가지다 — 내 이름이 어느 칸에 있는가, 그 시간에 어디인가.
//
// 조 목록은 **고정이 아니다.** 대면만 3개일 수도, 비대면이 없을 수도 있다(결정 95).
// 그래서 열은 실제 슬롯이 들고 있는 `panel` 값에서 만들고, 코드에 조 이름을 적어 두지 않는다.

import { slotPanelNumbers, slotPlaceLabel, type SlotForLabel } from './display';
import { formatDateKo, formatTimeRange, dayKeyOf } from './timetable';
import type { DutyRow } from './duty-rules';

export interface StaffTimetableSlot {
  id: string;
  /** 소속 조 이름('A조'). 0026 이전 슬롯은 null. */
  panel?: string | null;
  startsAt: string | Date;
  durationMin?: number | null;
  venue?: string | null;
  isRemote?: boolean | null;
  link?: string | null;
  /** 조 열 순서를 정하는 값(만든 순서). 없으면 맨 뒤로 민다. */
  createdAt?: string | Date | null;
}

export interface StaffTimetableCell {
  slotId: string;
  interviewers: string[];
  isRemote: boolean;
}

export interface StaffTimetableRow {
  startsAtMs: number;
  /** '10:00 ~ 10:30' */
  timeLabel: string;
  /** 조 이름 → 그 칸. 그 조가 이 시간대를 비웠으면 키가 없다. */
  byPanel: Record<string, StaffTimetableCell>;
  /** 대기실 전원 공지('전원 면접실 정비'). 있으면 업무 칸 대신 한 줄로 편다. */
  allNote: string | null;
  /** 업무 이름 → 맡은 사람 이름. */
  duties: Record<string, string>;
}

export interface StaffTimetableDay {
  dateLabel: string;
  /** 그날 실제로 쓰는 조만, 만든 순서로. */
  panels: string[];
  /** 조마다 장소가 다르므로 표 아래 한 번만 적는다. */
  placeByPanel: Record<string, string>;
  linkByPanel: Record<string, string>;
  rows: StaffTimetableRow[];
}

/**
 * 조 이름. 컬럼(0026)이 먼저고, 없으면 같은 시각 순번 → 그것도 없으면 장소로 부른다.
 *
 * 마지막 장소 fallback 이 있어야 **조를 나누기 전 기수**에서도 표가 한 열이라도 선다
 * (빈 열은 "배정이 없다"와 구별되지 않는다).
 */
function panelNameOf(slot: StaffTimetableSlot, fallbackNumbers: Record<string, number>): string {
  const named = slot.panel?.trim();
  if (named) return named;
  const n = fallbackNumbers[slot.id] ?? 0;
  return n > 0 ? `${n}조` : slotPlaceLabel(slot);
}

/**
 * 조 열 순서 = **만든 순서**(A조 → B조 → 비대면 파견). 지난 기수 시간표가 그 순서다(결정 95).
 *
 * 다른 두 방법은 둘 다 조용히 틀린다:
 * - 슬롯 등장 순서 → **첫 시간대를 비운 조가 맨 뒤로 밀린다**(A조가 첫 30분 면접실 정비면
 *   열이 'B조·비대면·A조'가 된다).
 * - 이름순 → 한글이 영문 앞에 오는 정렬 규칙 탓에 '비대면 파견'이 A조 앞에 선다.
 *
 * 같은 순간에 만든 조끼리(한 번의 insert)만 이름으로 갈라 순서를 고정한다 — 순서가 흔들리면
 * 새로고침할 때마다 열이 자리를 바꾼다.
 */
export function panelOrder<S>(slots: S[], labelOf: (slot: S) => string, createdAtOf: (slot: S) => unknown): string[] {
  const firstMade = new Map<string, number>();
  for (const slot of slots) {
    const label = labelOf(slot);
    if (!label) continue;
    const raw = createdAtOf(slot);
    const t = raw ? new Date(raw as string).getTime() : NaN;
    // createdAt 이 없거나 깨졌으면 순서를 주장하지 않는다 — 맨 뒤로 민다.
    const key = Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
    const prev = firstMade.get(label);
    if (prev === undefined || key < prev) firstMade.set(label, key);
  }
  return [...firstMade.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], 'ko'))
    .map(([panel]) => panel);
}

export function buildStaffTimetable({
  slots,
  interviewersBySlot,
  dutyRows = [],
}: {
  slots: StaffTimetableSlot[];
  /** 슬롯 id → 배정된 면접관 이름. */
  interviewersBySlot: Record<string, string[]>;
  /** 대기실 업무 배정(`buildDutyRows` 결과). 면접관이 아닌 운영진도 같은 표에서 봐야 한다. */
  dutyRows?: DutyRow[];
}): StaffTimetableDay[] {
  const valid = slots.filter((s) => !Number.isNaN(new Date(s.startsAt).getTime()));
  const numbers = slotPanelNumbers(valid as unknown as SlotForLabel[]);

  const slotsByDay = new Map<string, StaffTimetableSlot[]>();
  for (const slot of valid) {
    const key = dayKeyOf(new Date(slot.startsAt).getTime());
    const list = slotsByDay.get(key);
    if (list) list.push(slot);
    else slotsByDay.set(key, [slot]);
  }

  // 대기실 배정은 면접 슬롯이 지워진 시간대에도 남을 수 있다(`buildDutyRows` 가 일부러 살려 둔다).
  // 그 줄까지 날짜에 끼워 넣어야 "그 시간에 대기실이 비었다"를 모른 채 넘어가지 않는다.
  const dutyByDay = new Map<string, DutyRow[]>();
  for (const row of dutyRows) {
    if (Number.isNaN(row.startsAtMs)) continue;
    const key = dayKeyOf(row.startsAtMs);
    const list = dutyByDay.get(key);
    if (list) list.push(row);
    else dutyByDay.set(key, [row]);
  }

  const dayKeys = [...new Set([...slotsByDay.keys(), ...dutyByDay.keys()])].sort((a, b) => a.localeCompare(b));

  return dayKeys.map((key) => {
    const daySlots = slotsByDay.get(key) ?? [];
    const dayDuties = dutyByDay.get(key) ?? [];

    const panels = panelOrder(
      daySlots,
      (s) => panelNameOf(s, numbers),
      (s) => s.createdAt
    );

    // 장소·링크는 조마다 하나다(조 = 방 하나를 하루 종일 잡는 트랙). 칸마다 되풀이하면
    // 정작 사람 이름이 묻히므로 표 아래에 한 번만 적는다.
    const placeByPanel: Record<string, string> = {};
    const linkByPanel: Record<string, string> = {};
    for (const slot of daySlots) {
      const panel = panelNameOf(slot, numbers);
      placeByPanel[panel] ??= slotPlaceLabel(slot);
      const link = slot.link?.trim();
      if (link) linkByPanel[panel] ??= link;
    }

    const durationAt = new Map<number, number>();
    for (const slot of daySlots) {
      const t = new Date(slot.startsAt).getTime();
      if (!durationAt.has(t)) durationAt.set(t, slot.durationMin ?? 30);
    }

    const times = [
      ...new Set([...daySlots.map((s) => new Date(s.startsAt).getTime()), ...dayDuties.map((d) => d.startsAtMs)]),
    ].sort((a, b) => a - b);

    const dutyAt = new Map(dayDuties.map((d) => [d.startsAtMs, d]));
    const cellAt = new Map<string, StaffTimetableCell>();
    for (const slot of daySlots) {
      const t = new Date(slot.startsAt).getTime();
      cellAt.set(`${panelNameOf(slot, numbers)}|${t}`, {
        slotId: slot.id,
        interviewers: interviewersBySlot[slot.id] ?? [],
        isRemote: !!slot.isRemote,
      });
    }

    const rows: StaffTimetableRow[] = times.map((t) => {
      const byPanel: Record<string, StaffTimetableCell> = {};
      for (const panel of panels) {
        const cell = cellAt.get(`${panel}|${t}`);
        if (cell) byPanel[panel] = cell;
      }
      const duty = dutyAt.get(t);
      const duties: Record<string, string> = {};
      for (const [role, cell] of Object.entries(duty?.byDuty ?? {})) {
        if (cell.userName) duties[role] = cell.userName;
      }
      return {
        startsAtMs: t,
        timeLabel: formatTimeRange(t, durationAt.get(t) ?? 30),
        byPanel,
        allNote: duty?.allNote ?? null,
        duties,
      };
    });

    return { dateLabel: formatDateKo(times[0] ?? 0), panels, placeByPanel, linkByPanel, rows };
  });
}

/** 면접관이 아직 아무도 없는 칸 수. 배정을 끝냈는지 한눈에 알려 준다. */
export function cellsMissingInterviewers(days: StaffTimetableDay[]): number {
  return days.reduce(
    (n, day) =>
      n + day.rows.reduce((m, row) => m + Object.values(row.byPanel).filter((c) => c.interviewers.length === 0).length, 0),
    0
  );
}

/**
 * 표를 붙여넣기 좋은 텍스트로(탭 구분 = 엑셀·구글시트에 그대로 들어간다).
 * 운영진 단톡에 공지할 때 화면과 같은 모양이어야 말이 맞는다.
 */
export function staffTimetableToTsv(days: StaffTimetableDay[], dutyRoles: string[]): string {
  const lines: string[] = [];
  for (const day of days) {
    lines.push(day.dateLabel);
    // 대기실 업무는 실제로 배정된 것만 열로 세운다 — 빈 열이 늘어나면 붙여 넣은 표가 옆으로 샌다.
    const usedRoles = dutyRoles.filter((role) => day.rows.some((r) => r.duties[role]));
    // 전원 공지도 **자기 열**이다. 줄을 합쳐 쓰면(TSV 에는 셀 병합이 없으니 첫 칸에 넣고 나머지를 비우면)
    // 그 시간에 실제로 면접을 돌던 조의 면접관이 지워진다 — 둘 다 참인 사실이라 한쪽을 버릴 수 없다.
    const hasNote = day.rows.some((r) => r.allNote);
    lines.push(['시간', ...day.panels, ...usedRoles, ...(hasNote ? ['전원 공지'] : [])].join('\t'));
    for (const row of day.rows) {
      lines.push(
        [
          row.timeLabel,
          ...day.panels.map((p) => (row.byPanel[p] ? row.byPanel[p]!.interviewers.join('·') : '')),
          ...usedRoles.map((role) => row.duties[role] ?? ''),
          ...(hasNote ? [row.allNote ?? ''] : []),
        ].join('\t')
      );
    }
    lines.push('');
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}
