import { describe, it, expect } from 'vitest';
import { visibleLookupResult } from './lookup-visibility';

// 이 규칙이 무너지면 지원자가 발표 전에 당락을 먼저 알게 된다(09-RECRUIT-DESIGN §6.7).
describe('비로그인 조회 공개 범위', () => {
  describe('공개 스위치가 모두 꺼져 있으면 결과를 흘리지 않는다', () => {
    it('최종 합격/불합격을 심사 중으로 감춘다', () => {
      for (const s of ['final_pass', 'final_fail'] as const) {
        const v = visibleLookupResult(s, false, false);
        expect(v.stage).toBe('under_review');
        expect(v.showPassContent).toBe(false);
        expect(v.showInterview).toBe(false);
      }
    });

    it('서류 합격/불합격도 감춘다', () => {
      for (const s of ['doc_pass', 'doc_fail', 'interview_done', 'interview_noshow'] as const) {
        expect(visibleLookupResult(s, false, false).stage).toBe('under_review');
      }
    });

    it('접수 상태는 접수됐다는 사실만 보여준다', () => {
      const v = visibleLookupResult('received', false, false);
      expect(v.stage).toBe('received');
      expect(v.showInterview).toBe(false);
    });
  });

  describe('schedule_public 만 켜진 경우 — 서류 결과와 면접 안내까지', () => {
    it('서류 합격자에게 면접 정보를 보여준다', () => {
      const v = visibleLookupResult('doc_pass', true, false);
      expect(v.stage).toBe('doc_pass');
      expect(v.showInterview).toBe(true);
      expect(v.showPassContent).toBe(false);
    });

    it('서류 불합격자에게는 면접 정보를 주지 않는다', () => {
      const v = visibleLookupResult('doc_fail', true, false);
      expect(v.stage).toBe('doc_fail');
      expect(v.showInterview).toBe(false);
    });

    it('최종 결과가 났어도 result_public 이 꺼져 있으면 당락을 숨긴다', () => {
      for (const s of ['final_pass', 'final_fail'] as const) {
        const v = visibleLookupResult(s, true, false);
        expect(v.stage).toBe('interview_done'); // 면접까지 본 사실만
        expect(v.showPassContent).toBe(false);
      }
    });
  });

  describe('result_public 이 켜진 경우 — 최종 당락 공개', () => {
    it('최종 합격자에게만 축하 멘트·안내를 연다', () => {
      const pass = visibleLookupResult('final_pass', true, true);
      expect(pass.stage).toBe('final_pass');
      expect(pass.showPassContent).toBe(true);

      const fail = visibleLookupResult('final_fail', true, true);
      expect(fail.stage).toBe('final_fail');
      expect(fail.showPassContent).toBe(false);
    });

    it('result_public 만 켜고 schedule_public 이 꺼져 있어도 최종 결과는 나간다', () => {
      const v = visibleLookupResult('final_pass', false, true);
      expect(v.stage).toBe('final_pass');
      expect(v.showPassContent).toBe(true);
      expect(v.showInterview).toBe(false); // 면접 일정은 여전히 비공개
    });

    it('아직 최종 결정 전인 지원자는 result_public 과 무관하게 당락이 없다', () => {
      const v = visibleLookupResult('interview_done', true, true);
      expect(v.stage).toBe('interview_done');
      expect(v.showPassContent).toBe(false);
    });
  });
});
