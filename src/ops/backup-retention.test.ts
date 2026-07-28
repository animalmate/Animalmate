import { describe, it, expect } from 'vitest';
import { parseBackupName, shouldKeep, planRetention } from './backup-retention';

const TODAY = new Date(Date.UTC(2026, 6, 28)); // 2026-07-28

function file(name: string) {
  const parsed = parseBackupName(name);
  if (!parsed) throw new Error(`파싱 실패: ${name}`);
  return parsed;
}

describe('parseBackupName', () => {
  it('규칙에 맞는 이름을 파싱한다', () => {
    const f = file('backup-2026-07-01.sql.gz.gpg');
    expect(f.dayOfMonth).toBe(1);
    expect(f.date.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('규칙에 맞지 않는 이름은 null', () => {
    expect(parseBackupName('README.md')).toBeNull();
    expect(parseBackupName('.gitkeep')).toBeNull();
    expect(parseBackupName('backup-2026-07-28.sql.gz')).toBeNull(); // 암호화 안 된 것
    expect(parseBackupName('backup-20260728.sql.gz.gpg')).toBeNull();
    expect(parseBackupName('x-backup-2026-07-28.sql.gz.gpg')).toBeNull();
  });

  it('실재하지 않는 날짜는 null (Date.UTC 가 굴려 버리는 것을 막는다)', () => {
    expect(parseBackupName('backup-2026-02-30.sql.gz.gpg')).toBeNull();
    expect(parseBackupName('backup-2026-13-01.sql.gz.gpg')).toBeNull();
  });
});

describe('shouldKeep', () => {
  it('최근 8주 이내는 남긴다', () => {
    expect(shouldKeep(file('backup-2026-07-28.sql.gz.gpg'), TODAY)).toBe(true); // 0일
    expect(shouldKeep(file('backup-2026-06-02.sql.gz.gpg'), TODAY)).toBe(true); // 56일 = 경계
  });

  it('8주를 넘긴 평일자는 지운다', () => {
    // 57일 전(2026-06-01)은 8주를 넘겼지만 1일자라 월간 규칙으로 살아남는다.
    // 순수하게 경계만 보려면 1일이 아닌 날짜를 쓴다.
    expect(shouldKeep(file('backup-2026-05-31.sql.gz.gpg'), TODAY)).toBe(false); // 58일
  });

  it('매월 1일자는 6개월까지 남긴다', () => {
    expect(shouldKeep(file('backup-2026-06-01.sql.gz.gpg'), TODAY)).toBe(true); // 57일, 1일자
    expect(shouldKeep(file('backup-2026-02-01.sql.gz.gpg'), TODAY)).toBe(true); // 177일, 1일자
  });

  it('6개월을 넘긴 1일자는 지운다', () => {
    expect(shouldKeep(file('backup-2025-12-01.sql.gz.gpg'), TODAY)).toBe(false); // 239일
  });

  it('183일 경계에서 1일자를 남긴다', () => {
    // 2026-07-28 기준 183일 전 = 2026-01-25. 1일자 중 경계 안쪽인 2026-02-01 은 남는다.
    expect(shouldKeep(file('backup-2026-02-01.sql.gz.gpg'), TODAY)).toBe(true);
    expect(shouldKeep(file('backup-2026-01-01.sql.gz.gpg'), TODAY)).toBe(false); // 208일
  });

  it('미래 날짜는 지우지 않는다(시계 이상 시 보존이 안전한 쪽)', () => {
    expect(shouldKeep(file('backup-2026-08-30.sql.gz.gpg'), TODAY)).toBe(true);
  });
});

describe('planRetention', () => {
  it('남길 것·지울 것·건드리지 않을 것으로 나눈다', () => {
    const plan = planRetention(
      [
        'backup-2026-07-26.sql.gz.gpg', // 최근
        'backup-2026-06-01.sql.gz.gpg', // 1일자, 6개월 내
        'backup-2026-05-31.sql.gz.gpg', // 오래됨
        'backup-2025-12-01.sql.gz.gpg', // 1일자지만 6개월 초과
        'README.md',
        '.gitkeep',
      ],
      TODAY
    );
    expect(plan.keep).toEqual(['backup-2026-07-26.sql.gz.gpg', 'backup-2026-06-01.sql.gz.gpg']);
    expect(plan.remove).toEqual(['backup-2026-05-31.sql.gz.gpg', 'backup-2025-12-01.sql.gz.gpg']);
    expect(plan.ignored).toEqual(['README.md', '.gitkeep']);
  });

  it('빈 디렉터리에서 아무것도 지우지 않는다', () => {
    const plan = planRetention([], TODAY);
    expect(plan.remove).toEqual([]);
  });

  it('백업이 전부 오래됐어도 규칙 밖 파일은 절대 지우지 않는다', () => {
    const plan = planRetention(['README.md', 'restore.md'], TODAY);
    expect(plan.remove).toEqual([]);
    expect(plan.ignored).toHaveLength(2);
  });
});
