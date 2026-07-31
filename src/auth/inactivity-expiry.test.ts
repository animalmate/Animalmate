import { describe, it, expect } from 'vitest';
import { isInactive, wouldOrphanConsole, INACTIVE_LIMIT_DAYS } from './inactivity-expiry';

const NOW = new Date('2027-07-31T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe('isInactive', () => {
  it('기준(1년)을 넘겨 안 들어왔으면 만료 대상', () => {
    expect(isInactive(daysAgo(366), null, NOW)).toBe(true);
  });

  it('딱 1년째는 아직 아니다 — 경계에서 하루 일찍 뺏지 않는다', () => {
    expect(isInactive(daysAgo(365), null, NOW)).toBe(false);
    expect(isInactive(daysAgo(364), null, NOW)).toBe(false);
  });

  it('최근에 들어왔으면 대상이 아니다', () => {
    expect(isInactive(daysAgo(1), null, NOW)).toBe(false);
    expect(isInactive(NOW, null, NOW)).toBe(false);
  });

  it('한 번도 안 들어온 계정은 **가입 시각**으로 판단한다', () => {
    // last_seen 이 없다고 해서 봐주면, 가입만 하고 사라진 계정이 영원히 남는다.
    expect(isInactive(null, daysAgo(400), NOW)).toBe(true);
    expect(isInactive(null, daysAgo(10), NOW)).toBe(false);
  });

  it('판단 근거가 아예 없으면 만료시키지 않는다', () => {
    // 근거 없이 권한을 뺏는 쪽보다, 남겨 두고 사람이 보는 쪽이 낫다.
    expect(isInactive(null, null, NOW)).toBe(false);
  });

  it('last_seen 이 있으면 created_at 보다 우선한다', () => {
    // 오래전에 가입했어도 어제 들어왔으면 활동 중이다.
    expect(isInactive(daysAgo(1), daysAgo(1000), NOW)).toBe(false);
  });

  it('기준일은 1년이다', () => {
    expect(INACTIVE_LIMIT_DAYS).toBe(365);
  });
});

describe('wouldOrphanConsole', () => {
  // 사람이 하는 강등에는 마지막 권한자 보호가 여러 겹 있는데(members.ts) 자동 만료에는 없었다.
  // 1년 방치된 계정이라도, **잠긴 콘솔보다는 남아 있는 계정 하나가 낫다.**
  it('마지막 권한자까지 내려가면 참', () => {
    expect(wouldOrphanConsole(1, 1)).toBe(true);
    expect(wouldOrphanConsole(2, 2)).toBe(true);
  });

  it('한 명이라도 남으면 거짓 — 정상적으로 내린다', () => {
    expect(wouldOrphanConsole(2, 1)).toBe(false);
    expect(wouldOrphanConsole(5, 4)).toBe(false);
  });

  it('내릴 권한자가 없으면 애초에 해당 없음', () => {
    expect(wouldOrphanConsole(1, 0)).toBe(false);
    expect(wouldOrphanConsole(0, 0)).toBe(false);
  });
});
