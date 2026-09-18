import { describe, it, expect } from 'vitest';
import { coercePublicSwitches, isScheduleSwitchLocked, resolvePublicSwitches } from './public-switch-rules';
import { visibleLookupResult } from './lookup-visibility';

// 이 규칙이 무너지면 이미 끝난 지원자(서류 불합격·면접 불참)에게 "심사 중"이 뜬다.
describe('지원자 공개 스위치 규칙', () => {
  describe('허용하는 조합', () => {
    it('둘 다 끈 상태를 허용한다', () => {
      const r = resolvePublicSwitches({ schedulePublic: true, resultPublic: false }, { schedulePublic: false });
      expect(r).toEqual({ ok: true, next: { schedulePublic: false, resultPublic: false } });
    });

    it('면접만 공개하는 상태를 허용한다(최종 결과는 아직 발표 전)', () => {
      const r = resolvePublicSwitches({ schedulePublic: false, resultPublic: false }, { schedulePublic: true });
      expect(r).toEqual({ ok: true, next: { schedulePublic: true, resultPublic: false } });
    });

    it('면접 공개가 켜진 상태에서 최종 결과를 켤 수 있다', () => {
      const r = resolvePublicSwitches({ schedulePublic: true, resultPublic: false }, { resultPublic: true });
      expect(r).toEqual({ ok: true, next: { schedulePublic: true, resultPublic: true } });
    });

    it('최종 결과만 되돌려 끌 수 있다(면접 공개는 남는다)', () => {
      const r = resolvePublicSwitches({ schedulePublic: true, resultPublic: true }, { resultPublic: false });
      expect(r).toEqual({ ok: true, next: { schedulePublic: true, resultPublic: false } });
    });
  });

  describe('금지 조합 — 최종 결과 공개 + 면접 비공개', () => {
    it('결과 공개 중에 면접 공개를 끄려 하면 거절한다', () => {
      const r = resolvePublicSwitches({ schedulePublic: true, resultPublic: true }, { schedulePublic: false });
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.message).toContain('최종 결과 공개를 먼저 꺼');
    });

    it('면접 공개를 끈 채 두 값을 함께 보내도 거절한다(화면이 통째로 보내는 경로)', () => {
      const r = resolvePublicSwitches(
        { schedulePublic: true, resultPublic: true },
        { schedulePublic: false, resultPublic: true }
      );
      expect(r.ok).toBe(false);
    });

    it('면접 공개가 꺼진 상태에서 최종 결과만 켜려 하면 거절한다', () => {
      const r = resolvePublicSwitches({ schedulePublic: false, resultPublic: false }, { resultPublic: true });
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.message).toContain('함께 켜야');
    });

    it('규칙 이전에 저장된 어긋난 기수도 고칠 길은 열어 둔다', () => {
      // 이미 [면접 OFF + 결과 ON] 으로 저장된 기수가 있다. 그 값을 그대로 다시 보내는 것은
      // 금지 조합이라 거절하지만, 면접 공개를 켜서 바로잡는 요청은 통과해야 한다.
      expect(resolvePublicSwitches({ schedulePublic: false, resultPublic: true }, {}).ok).toBe(false);
      const fix = resolvePublicSwitches({ schedulePublic: false, resultPublic: true }, { schedulePublic: true });
      expect(fix).toEqual({ ok: true, next: { schedulePublic: true, resultPublic: true } });
    });
  });

  describe('화면 보정', () => {
    it('최종 결과를 켜면 면접 공개도 함께 켠다', () => {
      expect(coercePublicSwitches({ schedulePublic: false, resultPublic: true })).toEqual({
        schedulePublic: true,
        resultPublic: true,
      });
    });

    it('최종 결과가 꺼져 있으면 면접 공개 값을 건드리지 않는다', () => {
      expect(coercePublicSwitches({ schedulePublic: false, resultPublic: false })).toEqual({
        schedulePublic: false,
        resultPublic: false,
      });
    });

    it('보정한 값은 규칙을 통과한다', () => {
      const next = coercePublicSwitches({ schedulePublic: false, resultPublic: true });
      expect(resolvePublicSwitches({ schedulePublic: false, resultPublic: false }, next).ok).toBe(true);
    });

    it('결과 공개 중에는 켜져 있는 면접 스위치를 잠근다', () => {
      expect(isScheduleSwitchLocked({ schedulePublic: true, resultPublic: true })).toBe(true);
      expect(isScheduleSwitchLocked({ schedulePublic: true, resultPublic: false })).toBe(false);
      // 이미 어긋난 기수는 잠그지 않는다 — 켜서 고칠 수 있어야 한다.
      expect(isScheduleSwitchLocked({ schedulePublic: false, resultPublic: true })).toBe(false);
    });
  });

  // 이 규칙이 존재하는 이유 자체를 고정한다 — 금지한 조합에서 조회 화면이 실제로 거짓말을 한다.
  describe('규칙이 막는 실제 증상', () => {
    it('면접 비공개 + 결과 공개였다면 면접 불참자가 "심사 중"으로 보인다', () => {
      expect(visibleLookupResult('interview_noshow', false, true).stage).toBe('under_review');
      expect(visibleLookupResult('doc_fail', false, true).stage).toBe('under_review');
    });

    it('규칙이 강제하는 조합(둘 다 공개)에서는 제 단계로 보인다', () => {
      expect(visibleLookupResult('interview_noshow', true, true).stage).toBe('interview_noshow');
      expect(visibleLookupResult('doc_fail', true, true).stage).toBe('doc_fail');
      expect(visibleLookupResult('final_pass', true, true).stage).toBe('final_pass');
    });
  });
});
