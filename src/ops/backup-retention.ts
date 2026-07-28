// 백업 보존 정책 — 어떤 백업 파일을 남기고 어떤 것을 지울지 결정한다(순수 로직, 단위 테스트 필수).
//
// 정책(2026-07-28 확정):
//   - 최근 8주(56일) 이내 백업은 전부 남긴다.
//   - 매월 1일자 백업은 6개월(183일)까지 남긴다.
//   - 그 외는 지운다.
//
// 왜 순수 함수인가: 이 판단이 틀리면 **지우면 안 되는 백업을 지운다**. 되돌릴 수 없는 삭제라
// 파일시스템을 건드리지 않는 형태로 떼어 내 테스트한다. 실제 삭제는 CLI 부분이 한다.
//
// 날짜는 전부 **UTC 기준**이다. 파일명이 GitHub Actions 러너의 UTC 날짜로 만들어지고,
// 월 1일 판정도 그 날짜를 그대로 읽기 때문에 여기서 KST 로 바꾸면 하루가 밀린다.

/** 백업 파일명 규칙: backup-YYYY-MM-DD.sql.gz.gpg */
const FILENAME_RE = /^backup-(\d{4})-(\d{2})-(\d{2})\.sql\.gz\.gpg$/;

export const KEEP_RECENT_DAYS = 56; // 8주
export const KEEP_MONTHLY_DAYS = 183; // 약 6개월

export interface BackupFile {
  name: string;
  /** 파일명에서 뽑은 날짜(UTC 자정). */
  date: Date;
  /** 1~31. 1이면 월간 보존 대상. */
  dayOfMonth: number;
}

/**
 * 파일명을 파싱한다. 규칙에 맞지 않으면 null.
 * 실재하지 않는 날짜(2026-02-30 등)도 null 로 돌려 조용히 통과시키지 않는다.
 */
export function parseBackupName(name: string): BackupFile | null {
  const m = FILENAME_RE.exec(name);
  if (!m) return null;
  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC 는 2026-02-30 을 3월 2일로 굴려 버린다. 되돌려 보고 다르면 잘못된 날짜다.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { name, date, dayOfMonth: day };
}

function ageInDays(file: BackupFile, today: Date): number {
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((todayUtc - file.date.getTime()) / 86_400_000);
}

/** 이 파일을 남겨야 하는가. */
export function shouldKeep(file: BackupFile, today: Date): boolean {
  const age = ageInDays(file, today);
  // 미래 날짜(러너 시계 이상 등)는 지우지 않는다 — 판단이 서지 않을 땐 보존이 안전한 쪽이다.
  if (age < 0) return true;
  if (age <= KEEP_RECENT_DAYS) return true;
  if (file.dayOfMonth === 1 && age <= KEEP_MONTHLY_DAYS) return true;
  return false;
}

export interface RetentionPlan {
  keep: string[];
  remove: string[];
  /** 백업 파일명 규칙에 맞지 않아 판단하지 않은 것들. 지우지 않는다. */
  ignored: string[];
}

/**
 * 디렉터리에 있는 이름 목록 → 남길 것/지울 것 분류.
 * 규칙에 안 맞는 이름은 **건드리지 않는다**(README·.gitkeep 등이 함께 지워지면 안 된다).
 */
export function planRetention(names: string[], today: Date): RetentionPlan {
  const plan: RetentionPlan = { keep: [], remove: [], ignored: [] };
  for (const name of names) {
    const file = parseBackupName(name);
    if (!file) {
      plan.ignored.push(name);
      continue;
    }
    if (shouldKeep(file, today)) plan.keep.push(name);
    else plan.remove.push(name);
  }
  return plan;
}
