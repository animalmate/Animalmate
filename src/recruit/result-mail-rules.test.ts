import { describe, it, expect } from 'vitest';
import {
  BATCH_PER_TICK,
  DAILY_CAP,
  isExhausted,
  isResultMailTarget,
  MAX_ATTEMPTS,
  requiredSwitch,
  RESULT_MAIL_STAGES,
  resultMailContent,
  sendableNow,
  STAGE_LABEL,
} from './result-mail-rules';
import type { RecruitStatus } from './status';

const who = (status: RecruitStatus, extra: { slotId?: string | null; email?: string | null } = {}) => ({
  status,
  slotId: extra.slotId ?? null,
  email: extra.email === undefined ? 'a@example.invalid' : extra.email,
});

describe('결과 안내 메일 — 대상 판정', () => {
  it('서류 안내는 서류 결과가 정해진 사람 전원에게 — 합격도 불합격도 받는다', () => {
    expect(isResultMailTarget('document', who('doc_pass'))).toBe(true);
    expect(isResultMailTarget('document', who('doc_fail'))).toBe(true);
    // 아직 심사 전인 사람에게는 나가지 않는다.
    expect(isResultMailTarget('document', who('received'))).toBe(false);
  });

  it('서류 안내 대상은 조회 화면이 서류 결과를 보여 주는 집합과 같다', () => {
    // 한쪽만 넓으면 "결과 나왔다" 메일을 받고 들어와 "심사 중" 을 보게 된다.
    for (const s of ['doc_pass', 'doc_fail', 'interview_done', 'interview_noshow', 'final_pass', 'final_fail'] as RecruitStatus[]) {
      expect(isResultMailTarget('document', who(s))).toBe(true);
    }
  });

  it('면접 일정 안내는 자리가 잡힌 사람에게만 — 면접이 끝난 사람에게는 안 보낸다', () => {
    expect(isResultMailTarget('interview', who('doc_pass', { slotId: 'slot-1' }))).toBe(true);
    expect(isResultMailTarget('interview', who('doc_pass', { slotId: null }))).toBe(false); // 미배정
    expect(isResultMailTarget('interview', who('interview_done', { slotId: 'slot-1' }))).toBe(false);
    expect(isResultMailTarget('interview', who('doc_fail', { slotId: 'slot-1' }))).toBe(false);
  });

  it('최종 안내는 최종 결과가 정해진 사람 전원에게', () => {
    expect(isResultMailTarget('final', who('final_pass'))).toBe(true);
    expect(isResultMailTarget('final', who('final_fail'))).toBe(true);
    expect(isResultMailTarget('final', who('interview_done'))).toBe(false);
  });

  it('이메일이 없으면 어떤 단계도 대상이 아니다 — 보낼 곳이 없다', () => {
    expect(isResultMailTarget('document', who('doc_pass', { email: null }))).toBe(false);
    expect(isResultMailTarget('document', who('doc_pass', { email: '   ' }))).toBe(false);
    expect(isResultMailTarget('final', who('final_pass', { email: '' }))).toBe(false);
  });
});

describe('결과 안내 메일 — 공개 스위치 연결', () => {
  it('서류·면접은 일정 공개 스위치, 최종은 결과 공개 스위치를 요구한다', () => {
    expect(requiredSwitch('document')).toBe('schedulePublic');
    expect(requiredSwitch('interview')).toBe('schedulePublic');
    expect(requiredSwitch('final')).toBe('resultPublic');
  });
});

describe('결과 안내 메일 — 하루 한도 분배', () => {
  it('한 사이클 통수는 배치 상한을 넘지 않는다', () => {
    expect(sendableNow(0, 1000)).toBe(BATCH_PER_TICK);
  });

  it('대기열이 배치보다 적으면 있는 만큼만', () => {
    expect(sendableNow(0, 3)).toBe(3);
  });

  it('하루 한도를 다 쓰면 0 — 남은 것은 버리지 않고 다음 날로 미룬다', () => {
    expect(sendableNow(DAILY_CAP, 100)).toBe(0);
    expect(sendableNow(DAILY_CAP + 50, 100)).toBe(0); // 넘겨 세어도 음수가 되지 않는다
  });

  it('한도가 배치보다 조금 남았으면 남은 만큼만 보낸다', () => {
    expect(sendableNow(DAILY_CAP - 4, 100)).toBe(4);
  });

  it('인증 코드 메일 몫을 남겨 둔다 — 한도를 다 쓰면 아무도 로그인하지 못한다', () => {
    expect(DAILY_CAP).toBeLessThan(500); // Gmail 무료 계정 하루 한도
  });
});

describe('결과 안내 메일 — 재시도', () => {
  it('상한에 닿기 전에는 다시 시도한다', () => {
    expect(isExhausted(1)).toBe(false);
    expect(isExhausted(MAX_ATTEMPTS - 1)).toBe(false);
  });

  it('상한에 닿으면 실패로 확정한다', () => {
    expect(isExhausted(MAX_ATTEMPTS)).toBe(true);
  });
});

describe('결과 안내 메일 — 본문', () => {
  const VERDICT_WORDS = ['합격', '불합격', '탈락', '축하'];

  it('당락을 절대 쓰지 않는다 — 메일은 새기 쉬운 채널이다', () => {
    for (const stage of ['document', 'interview', 'final'] as const) {
      const { subject, text } = resultMailContent(stage, '34기', 'https://x.invalid/recruit');
      for (const word of VERDICT_WORDS) {
        expect(subject).not.toContain(word);
        expect(text).not.toContain(word);
      }
    }
  });

  it('조회 주소를 본문에 그대로 적는다 — 지원자는 계정이 없다', () => {
    const { text } = resultMailContent('document', '34기', 'https://x.invalid/recruit');
    expect(text).toContain('https://x.invalid/recruit');
  });

  it('제목에 기수와 무엇에 대한 안내인지 들어간다', () => {
    expect(resultMailContent('document', '34기', 'u').subject).toContain('34기');
    expect(resultMailContent('document', '34기', 'u').subject).toContain('서류');
    expect(resultMailContent('interview', '34기', 'u').subject).toContain('면접 일정');
    expect(resultMailContent('final', '34기', 'u').subject).toContain('최종');
  });

  it('면접 일정 변경 안내는 시간·장소를 확인하라고 알려 준다', () => {
    const { text } = resultMailContent('interview', '34기', 'u');
    expect(text).toContain('면접 일정이 바뀌었습니다');
    expect(text).toContain('일시와 장소');
    expect(text).toContain('접속 링크');
  });

  // ── 서류·면접을 한 통으로 합친 뒤(2026-09-04) 지켜야 하는 것들 ────────────────────────
  it('서류 안내 한 통에 면접 일정 안내가 함께 담긴다 — 두 통으로 갈리면 같은 사람이 두 번 받는다', () => {
    const { subject, text } = resultMailContent('document', '34기', 'u');
    expect(subject).toContain('서류 결과');
    expect(subject).toContain('면접 일정');
    expect(text).toContain('일시와 장소');
    expect(text).toContain('접속 링크');
  });

  it('서류 안내의 면접 줄은 단정하지 않는다 — 받은 것만으로 당락이 드러나면 안 된다', () => {
    // 이 메일은 불합격자에게도 똑같이 간다. "면접 일시를 확인하세요" 라고 단정하면
    // 메일을 받은 사실 자체가 서류 통과를 뜻하게 된다.
    expect(resultMailContent('document', '34기', 'u').text).toContain('면접 일정이 잡힌 경우');
  });

  it('면접 단계는 발표 뒤 배정이 바뀐 사람에게 가는 변경 안내다', () => {
    expect(resultMailContent('interview', '34기', 'u').subject).toContain('변경');
    expect(resultMailContent('interview', '34기', 'u').text).toContain('바뀐');
  });

  it('제목은 화면 라벨과 같다 — 회장단이 고른 이름과 지원자가 받는 제목이 어긋나면 안 된다', () => {
    for (const stage of RESULT_MAIL_STAGES) {
      expect(resultMailContent(stage, '34기', 'u').subject).toBe(`[애니멀메이트] 34기 ${STAGE_LABEL[stage]}`);
    }
  });

  it('조사가 어긋나지 않는다 — 문장을 한 틀에 끼워 넣으면 "일정가 나왔습니다" 가 된다', () => {
    for (const stage of RESULT_MAIL_STAGES) {
      const { text } = resultMailContent(stage, '34기', 'u');
      expect(text).not.toMatch(/일정가|결과이 /);
    }
  });
});
