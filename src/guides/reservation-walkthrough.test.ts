import { describe, it, expect } from 'vitest';
import {
  WALK_STEPS,
  SNOOZE_MS,
  parseSnoozedUntil,
  shouldAutoOpen,
  snoozeUntilFrom,
  snoozeRemainingLabel,
  shotPath,
  autoShotFile,
} from './reservation-walkthrough';

const NOW = new Date('2026-08-06T10:00:00Z').getTime();

describe('예약 흐름 둘러보기 — 단계 목록', () => {
  it('키가 겹치지 않는다(캡처 파일 이름이 키라서 겹치면 한 장이 다른 장을 덮어쓴다)', () => {
    const keys = WALK_STEPS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('키는 파일 이름으로 쓸 수 있는 모양이다', () => {
    for (const s of WALK_STEPS) expect(s.key).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it('그림이 하나도 없는 단계는 그 자리에 넣을 안내를 가지고 있다', () => {
    for (const s of WALK_STEPS) {
      const none = !s.shots.pc && !s.shots.mobile;
      if (none) expect(s.pending, `${s.key} 에 pending 이 없다`).toBeTruthy();
    }
  });

  it('모든 단계가 PC·휴대폰 두 장을 가진다 — 한쪽만 있으면 다른 기기를 쓰는 사람이 막힌다', () => {
    for (const s of WALK_STEPS) {
      expect(s.shots.pc, `${s.key} 에 PC 캡처가 없다`).toBeTruthy();
      expect(s.shots.mobile, `${s.key} 에 휴대폰 캡처가 없다`).toBeTruthy();
    }
  });

  it('전 과정이 예약 큐에서 시작해 카카오톡 예약으로 끝난다', () => {
    expect(WALK_STEPS[0]!.key).toBe('queue');
    expect(WALK_STEPS[WALK_STEPS.length - 1]!.key).toBe('kakao-send');
  });

  it('캡처 경로는 public 아래 한 곳으로 모인다', () => {
    expect(shotPath('queue.pc.png')).toBe('/help/reservations/queue.pc.png');
    expect(autoShotFile('queue', 'mobile')).toBe('queue.mobile.png');
  });

  it('자동 캡처 단계의 파일 이름은 캡처 스크립트 규칙과 같다', () => {
    // 카카오톡 두 장만 사람이 찍어 준 것이라 규칙 밖이다(앱 화면이라 자동으로 못 찍는다).
    for (const s of WALK_STEPS.filter((x) => !x.key.startsWith('kakao-o') && !x.key.startsWith('kakao-s'))) {
      expect(s.shots.pc).toBe(autoShotFile(s.key, 'pc'));
      expect(s.shots.mobile).toBe(autoShotFile(s.key, 'mobile'));
    }
  });
});

describe('예약 흐름 둘러보기 — 언제 저절로 뜨는가', () => {
  it('처음 온 사람에게는 열린다', () => {
    expect(shouldAutoOpen({ now: NOW, snoozedUntilRaw: null, closedThisSession: false })).toBe(true);
  });

  it('이 세션에서 이미 닫았으면 열지 않는다 — 큐를 들락거릴 때마다 뜨면 안 된다', () => {
    expect(shouldAutoOpen({ now: NOW, snoozedUntilRaw: null, closedThisSession: true })).toBe(false);
  });

  it('하루 동안 보지 않기를 눌렀으면 그 사이에는 열지 않는다', () => {
    const until = String(snoozeUntilFrom(NOW));
    expect(shouldAutoOpen({ now: NOW + 3600_000, snoozedUntilRaw: until, closedThisSession: false })).toBe(false);
  });

  it('하루가 지나면 다시 열린다', () => {
    const until = String(snoozeUntilFrom(NOW));
    expect(shouldAutoOpen({ now: NOW + SNOOZE_MS + 1, snoozedUntilRaw: until, closedThisSession: false })).toBe(true);
  });

  it('저장값이 망가져 있으면 없는 것으로 본다(영영 안 뜨는 상태로 굳지 않게)', () => {
    expect(parseSnoozedUntil('나중에', NOW)).toBeNull();
    expect(parseSnoozedUntil('', NOW)).toBeNull();
    expect(parseSnoozedUntil(null, NOW)).toBeNull();
    expect(shouldAutoOpen({ now: NOW, snoozedUntilRaw: 'NaN', closedThisSession: false })).toBe(true);
  });

  it('이미 지난 시각은 없는 것으로 본다', () => {
    expect(parseSnoozedUntil(String(NOW - 1), NOW)).toBeNull();
  });

  it('남은 시간을 사람 말로 알려준다', () => {
    expect(snoozeRemainingLabel(snoozeUntilFrom(NOW), NOW)).toBe('24시간 뒤에 다시 보여드려요');
    expect(snoozeRemainingLabel(NOW + 30 * 60_000, NOW)).toBe('1시간 뒤에 다시 보여드려요');
    expect(snoozeRemainingLabel(null, NOW)).toBeNull();
    expect(snoozeRemainingLabel(NOW - 1, NOW)).toBeNull();
  });
});
