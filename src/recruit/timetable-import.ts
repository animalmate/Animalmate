// 엑셀 면접 시간표 붙여넣기 → 슬롯 배정. 순수 파싱·대조 규칙(부수효과·DB 접근 없음).
//
// 왜 필요한가: 회장단은 이미 구글시트/엑셀에서 표를 완성해 놓고 온다(33기가 그랬다 — 조별 표
// 4장이 이미 있었다). 그걸 화면에서 한 명씩 드롭다운으로 다시 입력하면 200번을 눌러야 하고,
// 그 200번 사이에 한 칸만 밀려도 아무도 알아채지 못한다. 이미 맞는 표가 있으면 그대로 읽는다.
//
// 시각은 **한국 시간 고정**이다(timetable.ts 와 같은 이유). 붙여넣는 표의 '10:30' 은 언제나
// KST 10:30 이며, 보는 사람의 브라우저 시간대에 따라 다른 슬롯에 붙으면 안 된다.

const KST = 'Asia/Seoul';

/** 슬롯 시작 시각을 KST 'HH:MM' 으로. 표의 시간 칸과 맞춰 보는 유일한 키다. */
const kstHmFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: KST,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function kstHm(ms: number): string {
  return kstHmFmt.format(new Date(ms));
}

/**
 * 시간 칸 인식. '10:30 ~ 11:00' 이 기본형이지만 실제 표는 지저분하다 —
 * 33기 A조 표에는 `11:00 ~ 11;30` 처럼 콜론이 세미콜론으로 찍힌 줄이 있었다.
 * 여기서 걸러내지 못하면 그 줄만 조용히 사라져 5명이 배정되지 않는다.
 * 끝 시각은 읽되 쓰지 않는다 — 슬롯을 찾는 키는 시작 시각뿐이다(길이는 슬롯이 알고 있다).
 */
const TIME_RANGE = /(\d{1,2})\s*[:;.]\s*(\d{2})\s*(?:~|-|–|—|to)\s*(\d{1,2})\s*[:;.]\s*(\d{2})/;
/** 끝 시각 없이 '10:30' 만 적힌 표도 받는다. */
const TIME_ONLY = /^\s*(\d{1,2})\s*[:;.]\s*(\d{2})\s*$/;

/** 셀에서 시작 시각 'HH:MM' 을 뽑는다. 시간 칸이 아니면 null. */
export function parseStartHm(cell: string): string | null {
  const range = TIME_RANGE.exec(cell);
  const m = range ?? TIME_ONLY.exec(cell);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * 붙여넣은 텍스트를 셀 격자로. 엑셀·구글시트는 탭으로 구분해 준다.
 * 탭이 하나도 없으면 사람이 손으로 옮겨 적은 것이므로 2칸 이상 공백으로 나눈다.
 */
export function toGrid(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const hasTab = text.includes('\t');
  return lines
    .map((line) => (hasTab ? line.split('\t') : line.split(/ {2,}/)).map((c) => c.trim()))
    .filter((cells) => cells.some((c) => c !== ''));
}

/** 머리글에서 면접자 칸을 가리키는 말. '예비석'도 사람이 앉는 자리라 함께 읽는다. */
const APPLICANT_HEADER = /^(면접자|지원자|응시자)\s*\d*$|^예비석$/;
const INTERVIEWER_HEADER = /^(면접관|면접위원)\s*\d*$/;

export interface ParsedRow {
  /** 'HH:MM' (KST). */
  startHm: string;
  /** 그 줄에 적힌 면접자 이름(빈 칸 제외). */
  names: string[];
}

export interface ParsedTable {
  rows: ParsedRow[];
  /** 머리글로 면접자 칸을 특정했는가. false 면 시간 칸 오른쪽을 전부 이름으로 봤다는 뜻. */
  usedHeader: boolean;
  /** 시간 칸을 못 찾아 통째로 버린 줄(원문). 사람에게 그대로 보여 준다. */
  skipped: string[];
}

/**
 * 표 한 장을 읽는다.
 *
 * 열 순서를 고정하지 않는다. 33기 표는 `면접관1|면접관2|면접관3|A조(시간)|면접자1..5|예비석` 으로
 * **시간이 가운데**에 있고, 이 화면이 내보내는 TSV(`timetableToTsv`)는 시간이 맨 앞이다.
 * 순서를 가정하면 둘 중 하나는 면접관을 면접자로 읽어 엉뚱한 사람을 배정한다.
 * 그래서 머리글이 있으면 머리글로 면접자 칸을 특정하고, 없으면 시간 칸 오른쪽만 읽는다
 * (지난 기수 표가 모두 이 모양이었다 — 면접관은 시간 왼쪽).
 */
export function parseTimetableText(text: string): ParsedTable {
  const grid = toGrid(text);
  if (grid.length === 0) return { rows: [], usedHeader: false, skipped: [] };

  // 1) 머리글 줄 찾기 — '면접자N' 이 들어간 첫 줄. 표 위에 제목('비대면 A조')이 붙어 있어도 넘어간다.
  let applicantCols: number[] | null = null;
  let headerIdx = -1;
  for (let i = 0; i < grid.length; i++) {
    const cols = grid[i]!.map((c, j) => (APPLICANT_HEADER.test(c) ? j : -1)).filter((j) => j >= 0);
    if (cols.length > 0) {
      applicantCols = cols;
      headerIdx = i;
      break;
    }
  }

  // 2) 시간 칸 위치. 머리글 아래 줄들에서 시각이 가장 자주 나오는 열을 고른다.
  //    한 줄만 보고 정하면 '10:00' 이 적힌 비고 칸에 속는다.
  const body = grid.slice(headerIdx + 1);
  const hits = new Map<number, number>();
  for (const cells of body) {
    for (let j = 0; j < cells.length; j++) {
      if (parseStartHm(cells[j]!)) hits.set(j, (hits.get(j) ?? 0) + 1);
    }
  }
  let timeCol = -1;
  let best = 0;
  for (const [col, n] of hits) {
    if (n > best) {
      best = n;
      timeCol = col;
    }
  }
  if (timeCol < 0) return { rows: [], usedHeader: applicantCols !== null, skipped: [] };

  // 머리글의 면접자 칸이 시간 칸보다 왼쪽이면 머리글을 잘못 잡은 것이다 — 오른쪽만 남긴다.
  let cols = applicantCols?.filter((j) => j > timeCol) ?? null;

  // 머리글이 본문과 어긋났는지 본다. 잘 짜인 표라면 시간 칸 위에는 조 이름('A조', '비대면 시간',
  // '시간')이 온다 — 거기에 '면접관N'/'면접자N' 이 앉아 있으면 머리글과 본문의 열이 밀린 것이다.
  // 그대로 머리글 번호를 믿으면 이름이 한 칸씩 밀려 **다른 사람이 배정된다**. 조용히 틀리느니
  // 머리글을 버리고 시간 칸 오른쪽을 읽는다(지난 기수 표가 전부 이 모양이었다).
  const headerAtTime = headerIdx >= 0 ? grid[headerIdx]![timeCol] ?? '' : '';
  if (APPLICANT_HEADER.test(headerAtTime) || INTERVIEWER_HEADER.test(headerAtTime)) cols = null;

  const usedHeader = cols !== null && cols.length > 0;

  const rows: ParsedRow[] = [];
  const skipped: string[] = [];
  for (const cells of body) {
    const startHm = parseStartHm(cells[timeCol] ?? '');
    if (!startHm) {
      // 시각이 없는 줄. 표 제목·빈 줄이면 버려도 되지만 이름이 적혀 있으면 사람이 봐야 한다
      // ('전원 면접실 B 정비' 같은 안내 줄과, 시간 칸이 밀린 진짜 배정 줄을 여기서 구분할 수 없다).
      const text = cells.filter(Boolean).join(' ');
      if (text) skipped.push(text);
      continue;
    }
    const names = (usedHeader ? cols!.map((j) => cells[j] ?? '') : cells.slice(timeCol + 1))
      .map((c) => c.trim())
      .filter(Boolean);
    rows.push({ startHm, names });
  }

  return { rows, usedHeader, skipped };
}

// ── 이름 대조 ───────────────────────────────────────────────────────────────

/** 공백·괄호 주석을 걷어낸 대조용 키. '가 나다' 와 '가나다(1팀)' 이 같은 사람으로 잡힌다. */
export function nameKey(name: string): string {
  return name.replace(/\([^)]*\)/g, '').replace(/\s+/g, '').trim();
}

export interface ImportApplicant {
  id: string;
  name: string;
  slotId?: string | null;
  assignedTeam?: string | null;
  wishTeam1?: string | null;
  /** 동명이인을 사람이 구분할 수 있게 뒷자리만 쓴다(PII 최소화 — 전체 번호를 화면에 두지 않는다). */
  phone?: string | null;
}

export interface ImportSlot {
  id: string;
  startsAt: string | Date;
  panel?: string | null;
}

/** 한 이름 칸의 판정 결과. */
export type MatchOutcome =
  /** 배정할 사람이 정해졌다. `fromSlotId` 가 있으면 다른 슬롯에서 옮겨 온다. */
  | { kind: 'ok'; name: string; slotId: string; applicantId: string; fromSlotId: string | null }
  /** 이름이 같은 지원자가 여럿 — 사람이 골라야 한다. */
  | { kind: 'ambiguous'; name: string; slotId: string; candidates: ImportApplicant[] }
  /** 명단에 없는 이름(오타·미등록·서류 불합격). */
  | { kind: 'unknown'; name: string; slotId: string }
  /** 이미 그 슬롯에 배정돼 있다 — 바꿀 것이 없다. */
  | { kind: 'same'; name: string; slotId: string; applicantId: string };

export interface ImportPlan {
  outcomes: MatchOutcome[];
  /** 표에는 있는데 이 조에 없는 시각(예: 표는 10:00부터인데 슬롯은 10:30부터). */
  missingTimes: string[];
  /** 시간 칸을 못 읽어 넘어간 줄. */
  skipped: string[];
  usedHeader: boolean;
}

/**
 * 붙여넣은 표를 **한 조의 슬롯들**에 맞춰 본다.
 *
 * 조를 사람이 먼저 고르게 하는 이유: 표 여러 장을 한꺼번에 받아 조까지 알아서 맞추려 하면,
 * 같은 시각이 조마다 있으므로 어느 조인지 추측해야 하고 틀렸을 때 조 전체가 뒤바뀐다.
 * 조를 고정하면 대조 키가 시각 하나로 줄어 틀릴 구석이 없고, 실수해도 그 조 안에서 끝난다.
 *
 * 아직 아무것도 저장하지 않는다 — 결과를 사람이 확인한 뒤 `assignmentsOf` 로 넘긴다.
 */
export function buildImportPlan({
  text,
  slots,
  applicants,
}: {
  text: string;
  /** 붙여넣을 대상 조의 슬롯만. */
  slots: ImportSlot[];
  /** 이 기수에서 배정 가능한 지원자 전원(다른 조에 이미 앉은 사람 포함 — 옮기기를 잡아내야 한다). */
  applicants: ImportApplicant[];
}): ImportPlan {
  const { rows, usedHeader, skipped } = parseTimetableText(text);

  // 시각 → 슬롯. 같은 조 안에서 시각은 유일하다.
  const slotByHm = new Map<string, ImportSlot>();
  for (const s of slots) {
    const ms = new Date(s.startsAt).getTime();
    if (Number.isNaN(ms)) continue;
    slotByHm.set(kstHm(ms), s);
  }

  const byName = new Map<string, ImportApplicant[]>();
  for (const a of applicants) {
    const key = nameKey(a.name);
    const list = byName.get(key);
    if (list) list.push(a);
    else byName.set(key, [a]);
  }

  const outcomes: MatchOutcome[] = [];
  const missingTimes: string[] = [];
  // 같은 표 안에서 한 사람이 두 번 나오면 뒤엣것이 앞엣것을 덮어써 앞 슬롯이 조용히 빈다.
  // 두 번째부터는 '이름이 두 번 나왔다'로 사람에게 보여 준다.
  const seen = new Set<string>();

  for (const row of rows) {
    const slot = slotByHm.get(row.startHm);
    if (!slot) {
      if (row.names.length > 0) missingTimes.push(row.startHm);
      continue;
    }
    for (const raw of row.names) {
      const key = nameKey(raw);
      const found = byName.get(key) ?? [];
      if (found.length === 0 || seen.has(key)) {
        outcomes.push({ kind: 'unknown', name: raw, slotId: slot.id });
        continue;
      }
      if (found.length > 1) {
        outcomes.push({ kind: 'ambiguous', name: raw, slotId: slot.id, candidates: found });
        continue;
      }
      const a = found[0]!;
      seen.add(key);
      outcomes.push(
        a.slotId === slot.id
          ? { kind: 'same', name: raw, slotId: slot.id, applicantId: a.id }
          : { kind: 'ok', name: raw, slotId: slot.id, applicantId: a.id, fromSlotId: a.slotId ?? null }
      );
    }
  }

  return { outcomes, missingTimes, skipped, usedHeader };
}

/**
 * 확정된 판정 + 사람이 고른 동명이인 선택을 실제 배정 목록으로.
 * `same` 은 넣지 않는다 — 바뀌는 것이 없는데 쓰면 audit 이 허수로 부풀고 요청도 커진다.
 */
export function assignmentsOf(
  outcomes: MatchOutcome[],
  /** 동명이인 판정에서 사람이 고른 지원자 id. 키는 `ambiguousKey`. */
  resolved: Record<string, string> = {}
): { applicantId: string; slotId: string }[] {
  const out: { applicantId: string; slotId: string }[] = [];
  const taken = new Set<string>();
  for (const o of outcomes) {
    let applicantId: string | null = null;
    if (o.kind === 'ok') applicantId = o.applicantId;
    else if (o.kind === 'ambiguous') applicantId = resolved[ambiguousKey(o)] ?? null;
    if (!applicantId || taken.has(applicantId)) continue;
    taken.add(applicantId);
    out.push({ applicantId, slotId: o.slotId });
  }
  return out;
}

/** 동명이인 판정을 화면 상태와 이어 주는 키(같은 이름이 여러 슬롯에 나올 수 있다). */
export function ambiguousKey(o: { name: string; slotId: string }): string {
  return `${o.slotId}::${o.name}`;
}

/** 확인 화면 머리에 띄울 요약. */
export function summarizePlan(plan: ImportPlan) {
  const count = (kind: MatchOutcome['kind']) => plan.outcomes.filter((o) => o.kind === kind).length;
  const moves = plan.outcomes.filter((o) => o.kind === 'ok' && o.fromSlotId !== null).length;
  return {
    assign: count('ok'),
    moves,
    same: count('same'),
    ambiguous: count('ambiguous'),
    unknown: count('unknown'),
  };
}
