// 면접 당일 대기실 업무 배정 — 순수 규칙(부수효과·DB 접근 없음).
// duties.ts 는 db/client 를 import 하므로, 단위 테스트가 DB 없이 규칙만 검증할 수 있도록 분리한다
// (CLAUDE.md 코드 컨벤션).

/** 전원 공지 줄('전원 면접실 B 정비')을 나타내는 duty 센티넬. 역할 이름과 겹치지 않게 둔다. */
export const DUTY_ALL = '__ALL__';

/**
 * 기수 설정이 없을 때 쓰는 기본 업무 이름. 지난 기수가 실제로 쓰던 구성이다.
 * 기수마다 다르므로 `recruit_cohorts.duty_roles` 로 덮어쓸 수 있다.
 */
export const DEFAULT_DUTY_ROLES = [
  '면접자 명단 체크',
  '대기실 안내',
  '면접장 인솔a',
  '면접장 인솔b',
] as const;

/** 저장·표시에 쓸 업무 목록. 빈 배열·null 이면 기본값. */
export function resolveDutyRoles(configured: unknown): string[] {
  if (!Array.isArray(configured)) return [...DEFAULT_DUTY_ROLES];
  const cleaned = configured
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean);
  // 이름이 겹치면 UNIQUE(cohort, starts_at, duty) 때문에 한 칸이 다른 칸을 덮어쓴다.
  const unique = [...new Set(cleaned)];
  return unique.length > 0 ? unique : [...DEFAULT_DUTY_ROLES];
}

/** 저장하려는 duty 가 이 기수에서 쓸 수 있는 값인가(임의 문자열로 행이 늘어나는 것을 막는다). */
export function isValidDuty(duty: string, roles: string[]): boolean {
  return duty === DUTY_ALL || roles.includes(duty);
}

export interface DutyRowInput {
  startsAt: string | Date;
  duty: string;
  userId?: string | null;
  note?: string | null;
}

export interface DutyCell {
  userId: string | null;
  userName: string | null;
}

export interface DutyRow {
  /** 정렬·조회용 시각(ms). */
  startsAtMs: number;
  /** 이 시간대 전원 공지. 있으면 역할 칸 대신 한 줄로 펼친다. */
  allNote: string | null;
  /** 역할 이름 → 배정된 사람. 배정이 없으면 키가 없다. */
  byDuty: Record<string, DutyCell>;
}

export interface BuildDutyRowsInput {
  /** 시간축(면접 슬롯에서 온다). 대기실 표는 면접 표와 같은 줄을 써야 나란히 읽힌다. */
  startTimes: number[];
  assignments: {
    startsAt: string | Date;
    duty: string;
    userId: string | null;
    note: string | null;
    userName?: string | null;
  }[];
}

/**
 * 배정 레코드를 시간축에 맞춰 줄로 편다.
 * 배정이 없는 시간대도 줄을 만든다 — 면접 시간표와 줄 수가 달라지면 나란히 볼 수 없다.
 */
export function buildDutyRows({ startTimes, assignments }: BuildDutyRowsInput): DutyRow[] {
  const rows = new Map<number, DutyRow>();
  for (const t of startTimes) rows.set(t, { startsAtMs: t, allNote: null, byDuty: {} });

  for (const a of assignments) {
    const t = new Date(a.startsAt).getTime();
    if (Number.isNaN(t)) continue;
    // 면접 슬롯이 지워져 시간축에서 사라진 배정도 버리지 않고 줄을 만든다 —
    // 조용히 없어지면 그 시간에 대기실이 빈 줄 모른 채 넘어간다.
    let row = rows.get(t);
    if (!row) {
      row = { startsAtMs: t, allNote: null, byDuty: {} };
      rows.set(t, row);
    }
    if (a.duty === DUTY_ALL) {
      row.allNote = a.note?.trim() || null;
    } else {
      row.byDuty[a.duty] = { userId: a.userId, userName: a.userName ?? null };
    }
  }

  return [...rows.values()].sort((x, y) => x.startsAtMs - y.startsAtMs);
}

/**
 * 대기실 표를 붙여넣기 좋은 텍스트로. 면접 시간표와 같은 파일에 이어 붙여 공지한다.
 * 전원 공지 줄은 첫 칸에 문구를 넣고 나머지를 비운다 — TSV 에는 셀 병합이 없다.
 */
export function dutyRosterToTsv(
  roles: string[],
  rows: DutyRow[],
  timeLabel: (startsAtMs: number) => string
): string {
  if (rows.length === 0) return '';
  const lines = [['대기실', ...roles].join('\t')];
  for (const row of rows) {
    if (row.allNote) {
      lines.push([timeLabel(row.startsAtMs), row.allNote, ...roles.slice(1).map(() => '')].join('\t'));
      continue;
    }
    lines.push([timeLabel(row.startsAtMs), ...roles.map((r) => row.byDuty[r]?.userName ?? '')].join('\t'));
  }
  return lines.join('\n');
}

/** 한 사람이 같은 시간대에 두 가지 업무를 맡고 있는가(몸이 하나뿐이다). */
export function findDoubleBookedDuties(rows: DutyRow[]): { startsAtMs: number; userName: string }[] {
  const out: { startsAtMs: number; userName: string }[] = [];
  for (const row of rows) {
    const seen = new Map<string, string>(); // userId → name
    const dup = new Set<string>();
    for (const cell of Object.values(row.byDuty)) {
      if (!cell.userId) continue;
      if (seen.has(cell.userId)) dup.add(cell.userId);
      else seen.set(cell.userId, cell.userName ?? '이름 미상');
    }
    for (const id of dup) out.push({ startsAtMs: row.startsAtMs, userName: seen.get(id)! });
  }
  return out;
}
