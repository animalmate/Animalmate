// 면접 시간표 격자 만들기(순수). 운영진에게 공지할 표를 화면과 복사본이 똑같이 쓰도록
// 여기서 한 번만 짠다.
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

export interface TimetableSlot {
  id: string;
  startsAt: string | Date;
  durationMin?: number | null;
  venue?: string | null;
  isRemote?: boolean | null;
  link?: string | null;
}

export interface TimetablePerson {
  name: string;
  team?: string | null;
}

/** 한 칸에 들어가는 것 = 슬롯 하나 + 그 슬롯의 면접관·지원자. */
export interface TimetableCell {
  slotId: string;
  durationMin: number | null;
  link: string | null;
  interviewers: string[];
  applicants: TimetablePerson[];
  /** 같은 시각·같은 장소를 나눠 쓰는 조 번호(1-based). 그 칸에 슬롯이 하나뿐이면 0. */
  panelNo: number;
}

export interface TimetableRow {
  timeLabel: string;
  /** places 와 같은 길이. 그 시각·그 장소에 슬롯이 없으면 빈 배열. */
  cells: TimetableCell[][];
}

export interface TimetableDay {
  dateLabel: string;
  places: string[];
  rows: TimetableRow[];
}

export interface BuildTimetableInput {
  slots: TimetableSlot[];
  /** 슬롯 id → 그 슬롯 면접 대상자. */
  applicantsBySlot: Record<string, TimetablePerson[]>;
  /** 슬롯 id → 면접관 이름. */
  interviewersBySlot: Record<string, string[]>;
  /** 장소 표기 규칙(display.slotPlaceLabel 을 넘긴다 — 화면과 같은 문구를 쓰기 위해). */
  placeLabel: (slot: TimetableSlot) => string;
}

/**
 * 슬롯 목록을 날짜별 격자로 접는다. 행=시각, 열=장소.
 *
 * 같은 시각·같은 장소에 슬롯이 여럿인 것은 **정상 운영**이다 — 한 방에서 면접관 조를 나눠
 * 동시에 여러 명을 본다. 그래서 한 칸에 조를 모두 담고 각각 조 번호를 붙인다.
 * 하나만 보여주면 다른 조에 배정된 지원자가 표에서 사라진다.
 */
export function buildTimetable({
  slots,
  applicantsBySlot,
  interviewersBySlot,
  placeLabel,
}: BuildTimetableInput): TimetableDay[] {
  const byDay = new Map<string, { label: string; slots: TimetableSlot[] }>();

  for (const slot of slots) {
    const d = new Date(slot.startsAt);
    if (Number.isNaN(d.getTime())) continue; // 깨진 값이 표 전체를 무너뜨리지 않게
    const key = sortKeyFmt.format(d);
    if (!byDay.has(key)) byDay.set(key, { label: dateFmt.format(d), slots: [] });
    byDay.get(key)!.slots.push(slot);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, day]) => {
      const places = [...new Set(day.slots.map(placeLabel))].sort((a, b) => a.localeCompare(b, 'ko'));

      const timeKeys = [...new Set(day.slots.map((s) => new Date(s.startsAt).getTime()))].sort(
        (a, b) => a - b
      );

      const rows: TimetableRow[] = timeKeys.map((t) => ({
        timeLabel: timeFmt.format(new Date(t)),
        cells: places.map((place) => {
          const inCell = day.slots.filter(
            (s) => new Date(s.startsAt).getTime() === t && placeLabel(s) === place
          );
          return inCell.map((s, i) => ({
            slotId: s.id,
            durationMin: s.durationMin ?? null,
            link: s.link ?? null,
            interviewers: interviewersBySlot[s.id] ?? [],
            applicants: applicantsBySlot[s.id] ?? [],
            // 한 칸에 조가 여럿일 때만 번호를 붙인다.
            panelNo: inCell.length > 1 ? i + 1 : 0,
          }));
        }),
      }));

      return { dateLabel: day.label, places, rows };
    });
}

/**
 * 표를 붙여넣기 좋은 텍스트로. 탭 구분이라 엑셀·구글시트에 그대로 들어가고,
 * 카톡에 붙여도 줄 단위로는 읽힌다.
 */
export function timetableToTsv(days: TimetableDay[]): string {
  const lines: string[] = [];
  for (const day of days) {
    lines.push(day.dateLabel);
    lines.push(['시각', ...day.places].join('\t'));
    for (const row of day.rows) {
      const cells = row.cells.map((entries) =>
        entries
          .map((c) => {
            const who = c.applicants.map((a) => a.name).join(', ') || '지원자 없음';
            const staff = c.interviewers.join(', ') || '면접관 미정';
            const panel = c.panelNo > 0 ? `${c.panelNo}조 ` : '';
            return `${panel}${who} / ${staff}`;
          })
          // 한 칸에 조가 여럿이면 줄바꿈 대신 ' + ' 로 이어 붙인다 —
          // TSV 안의 줄바꿈은 붙여넣을 때 행이 쪼개진다.
          .join(' + ')
      );
      lines.push([row.timeLabel, ...cells].join('\t'));
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

/** 면접관이 한 명도 없는데 지원자는 배정된 슬롯 수 — 시간표에서 바로 알려 준다. */
export function slotsMissingInterviewers(days: TimetableDay[]): number {
  return days.reduce(
    (n, d) =>
      n +
      d.rows.reduce(
        (m, r) =>
          m + r.cells.flat().filter((c) => c.interviewers.length === 0 && c.applicants.length > 0).length,
        0
      ),
    0
  );
}
