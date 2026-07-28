// 면접 시간표 — 지난 기수가 실제로 쓰던 엑셀 표와 같은 모양으로 짠다.
// 조(면접실)마다 표 하나 / 행 = 시간 범위 / 열 = 면접관 N + 면접자 M.
//
// 왜 이 모양인가: 운영진에게 공지하는 표라 "그 시간에 내가 어디서 누구를 보는가"가 한 줄로
// 읽혀야 한다. 시각×장소 격자에 사람을 몰아넣으면 한 칸이 길어져 그게 안 된다.
//
// 시각은 **한국 시간에 고정**한다. 봉사·면접이 전부 한국에서 열리므로 보는 사람의 브라우저
// 시간대에 따라 표가 달라지면 안 된다(공지에 붙일 표라 더욱). 덕분에 테스트도 기계 시간대와
// 무관하게 같은 값이 나온다.

const KST = 'Asia/Seoul';

const dateFmt = new Intl.DateTimeFormat('ko-KR', {
  timeZone: KST,
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
});
const timeFmt = new Intl.DateTimeFormat('ko-KR', {
  timeZone: KST,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
/** 정렬용 키(YYYY-MM-DD). 표시용 라벨과 달리 순서가 보장돼야 한다. */
const sortKeyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: KST,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** '10:00 ~ 10:30'. 면접 표와 대기실 표가 같은 문구를 써야 나란히 읽힌다. */
export function formatTimeRange(startMs: number, durationMin: number): string {
  const end = startMs + durationMin * 60_000;
  return `${timeFmt.format(new Date(startMs))} ~ ${timeFmt.format(new Date(end))}`;
}

/** 여러 슬롯에서 시간축(시작 시각 ms 오름차순)과 시각별 소요 시간을 뽑는다. */
export function timeAxisOf(slots: { startsAt: string | Date; durationMin?: number | null }[]): {
  startTimes: number[];
  durationAt: Record<number, number>;
} {
  const durationAt: Record<number, number> = {};
  for (const s of slots) {
    const t = new Date(s.startsAt).getTime();
    if (Number.isNaN(t)) continue;
    durationAt[t] ??= s.durationMin ?? 30;
  }
  return { startTimes: Object.keys(durationAt).map(Number).sort((a, b) => a - b), durationAt };
}

export interface TimetableSlot {
  id: string;
  startsAt: string | Date;
  durationMin?: number | null;
  venue?: string | null;
  isRemote?: boolean | null;
  link?: string | null;
}

export interface TimetableRow {
  /** '10:30 ~ 11:00' */
  timeLabel: string;
  /** 이 조·이 시간대의 슬롯. 없으면 null(빈 줄로 남겨 조끼리 시간축을 맞춘다). */
  slotId: string | null;
  interviewers: string[];
  /** 이름만. 팀은 넣지 않는다 — 표가 지저분해지고 공지에 필요하지도 않다. */
  applicants: string[];
  link: string | null;
}

export interface TimetableTrack {
  /** '학생회관 201호' 또는 조가 나뉘면 '학생회관 201호 1조'. */
  label: string;
  rows: TimetableRow[];
}

export interface TimetableDay {
  dateLabel: string;
  /** 모든 조가 같은 열 수를 쓴다 — 표끼리 나란히 놓고 비교할 수 있어야 한다. */
  interviewerCols: number;
  applicantCols: number;
  tracks: TimetableTrack[];
}

export interface BuildTimetableInput {
  slots: TimetableSlot[];
  /** 슬롯 id → 그 슬롯 면접 대상자 이름. */
  applicantsBySlot: Record<string, string[]>;
  /** 슬롯 id → 면접관 이름. */
  interviewersBySlot: Record<string, string[]>;
  /** 장소 표기 규칙(display.slotPlaceLabel 을 넘긴다 — 화면과 같은 문구를 쓰기 위해). */
  placeLabel: (slot: TimetableSlot) => string;
}

const startOf = (s: TimetableSlot) => new Date(s.startsAt).getTime();

export function buildTimetable({
  slots,
  applicantsBySlot,
  interviewersBySlot,
  placeLabel,
}: BuildTimetableInput): TimetableDay[] {
  const valid = slots.filter((s) => !Number.isNaN(startOf(s))); // 깨진 값이 표를 무너뜨리지 않게

  const byDay = new Map<string, TimetableSlot[]>();
  for (const slot of valid) {
    const key = sortKeyFmt.format(new Date(slot.startsAt));
    const list = byDay.get(key);
    if (list) list.push(slot);
    else byDay.set(key, [slot]);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, daySlots]) => buildDay(daySlots, applicantsBySlot, interviewersBySlot, placeLabel));
}

function buildDay(
  daySlots: TimetableSlot[],
  applicantsBySlot: Record<string, string[]>,
  interviewersBySlot: Record<string, string[]>,
  placeLabel: (slot: TimetableSlot) => string
): TimetableDay {
  // 1) 조(트랙) 나누기. 같은 장소에서 동시에 여러 조가 돌면 장소 하나가 조 여럿이 된다.
  //    한 조 = 시간이 겹치지 않는 슬롯들의 한 줄기.
  const byPlace = new Map<string, TimetableSlot[]>();
  for (const s of daySlots) {
    const p = placeLabel(s);
    const list = byPlace.get(p);
    if (list) list.push(s);
    else byPlace.set(p, [s]);
  }

  const tracks: { label: string; slots: Map<number, TimetableSlot> }[] = [];
  for (const [place, placeSlots] of [...byPlace.entries()].sort(([a], [b]) => a.localeCompare(b, 'ko'))) {
    // 같은 시각에 n 개가 있으면 조가 n 개. i번째 슬롯은 i번째 조로 간다.
    const lanes: Map<number, TimetableSlot>[] = [];
    const byStart = new Map<number, TimetableSlot[]>();
    for (const s of placeSlots) {
      const t = startOf(s);
      const list = byStart.get(t);
      if (list) list.push(s);
      else byStart.set(t, [s]);
    }
    for (const [t, atTime] of byStart) {
      atTime.forEach((s, i) => {
        (lanes[i] ??= new Map()).set(t, s);
      });
    }
    lanes.forEach((lane, i) => {
      tracks.push({ label: lanes.length > 1 ? `${place} ${i + 1}조` : place, slots: lane });
    });
  }

  // 2) 시간축. 모든 조가 같은 줄을 쓴다 — 빈 시간대도 남겨야 표끼리 나란히 읽힌다.
  const starts = [...new Set(daySlots.map(startOf))].sort((a, b) => a - b);
  const durationAt = new Map<number, number>();
  for (const s of daySlots) {
    if (!durationAt.has(startOf(s))) durationAt.set(startOf(s), s.durationMin ?? 30);
  }
  const timeLabels = starts.map((t) => {
    const end = t + (durationAt.get(t) ?? 30) * 60_000;
    return `${timeFmt.format(new Date(t))} ~ ${timeFmt.format(new Date(end))}`;
  });

  // 3) 조마다 줄 채우기.
  const built: TimetableTrack[] = tracks.map((track) => ({
    label: track.label,
    rows: starts.map((t, i) => {
      const slot = track.slots.get(t);
      return {
        timeLabel: timeLabels[i]!,
        slotId: slot?.id ?? null,
        interviewers: slot ? interviewersBySlot[slot.id] ?? [] : [],
        applicants: slot ? applicantsBySlot[slot.id] ?? [] : [],
        link: slot?.link ?? null,
      };
    }),
  }));

  // 4) 열 수는 그날 최댓값으로 통일. 최소 1칸은 둔다(빈 표도 모양이 있어야 한다).
  const all = built.flatMap((t) => t.rows);
  const interviewerCols = Math.max(1, ...all.map((r) => r.interviewers.length));
  const applicantCols = Math.max(1, ...all.map((r) => r.applicants.length));

  return {
    dateLabel: dateFmt.format(new Date(starts[0]!)),
    interviewerCols,
    applicantCols,
    tracks: built,
  };
}

/**
 * 표를 붙여넣기 좋은 텍스트로. 탭 구분이라 엑셀·구글시트에 그대로 들어간다.
 * 화면과 같은 모양(조마다 표 하나)이어야 공지에 붙였을 때 말이 맞는다.
 */
export function timetableToTsv(days: TimetableDay[]): string {
  const lines: string[] = [];
  for (const day of days) {
    lines.push(day.dateLabel);
    for (const track of day.tracks) {
      const header = [
        track.label,
        ...Array.from({ length: day.interviewerCols }, (_, i) => `면접관${i + 1}`),
        ...Array.from({ length: day.applicantCols }, (_, i) => `면접자${i + 1}`),
      ];
      lines.push(header.join('\t'));
      for (const row of track.rows) {
        const cells = [
          row.timeLabel,
          ...pad(row.interviewers, day.interviewerCols),
          ...pad(row.applicants, day.applicantCols),
        ];
        lines.push(cells.join('\t'));
      }
      lines.push('');
    }
  }
  // trimEnd 를 쓰면 안 된다 — 마지막 줄의 빈 칸이 탭으로 끝나는데 그 탭까지 지워져
  // 엑셀에 붙였을 때 열이 하나 밀린다. 빈 '줄'만 걷어낸다.
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

const pad = (xs: string[], n: number) => Array.from({ length: n }, (_, i) => xs[i] ?? '');

/** 면접관이 한 명도 없는데 지원자는 배정된 슬롯 수 — 시간표에서 바로 알려 준다. */
export function slotsMissingInterviewers(days: TimetableDay[]): number {
  return days.reduce(
    (n, d) =>
      n +
      d.tracks.reduce(
        (m, t) => m + t.rows.filter((r) => r.slotId && r.interviewers.length === 0 && r.applicants.length > 0).length,
        0
      ),
    0
  );
}
