import { describe, it, expect } from 'vitest';
import { detectPii, piiWarning, findSensitiveIds } from './pii';

describe('detectPii', () => {
  it('휴대폰 번호를 잡는다(구분자 유무 무관)', () => {
    expect(detectPii('연락처 010-1234-5678').some((f) => f.kind === 'phone')).toBe(true);
    expect(detectPii('01012345678 로 연락').some((f) => f.kind === 'phone')).toBe(true);
  });

  it('주민등록번호를 잡는다', () => {
    expect(detectPii('901231-1234567').some((f) => f.kind === 'rrn')).toBe(true);
  });

  it('계좌번호는 문맥(계좌/입금)이 있을 때만 잡는다(긴 숫자 오탐 방지)', () => {
    expect(detectPii('계좌 110-234-567890 으로 입금').some((f) => f.kind === 'account')).toBe(true);
    // 문맥 없는 긴 숫자(예: 문서 ID)는 계좌로 보지 않는다
    expect(detectPii('주문번호 1102345678901234').some((f) => f.kind === 'account')).toBe(false);
  });

  it('이메일을 잡는다', () => {
    expect(detectPii('문의: hong@example.com').some((f) => f.kind === 'email')).toBe(true);
  });

  it('개인정보가 없는 평범한 문서는 아무것도 잡지 않는다', () => {
    expect(detectPii('한 학기 회비는 2만원이고 봉사는 매주 토요일에 진행합니다.')).toHaveLength(0);
  });

  it('예시는 마스킹되어 원본 전체가 그대로 노출되지 않는다', () => {
    const [f] = detectPii('010-1234-5678');
    expect(f!.sample).not.toBe('010-1234-5678');
    expect(f!.sample).toContain('*');
  });

  it('종류별로 한 번씩만 보고한다(같은 종류 반복 억제)', () => {
    const findings = detectPii('010-1111-2222 그리고 010-3333-4444');
    expect(findings.filter((f) => f.kind === 'phone')).toHaveLength(1);
  });
});

describe('piiWarning', () => {
  it('감지 없으면 null', () => {
    expect(piiWarning([])).toBeNull();
  });
  it('감지되면 어떤 종류인지 알려주는 경고 문구', () => {
    const w = piiWarning(detectPii('010-1234-5678'));
    expect(w).toContain('휴대폰');
    expect(w).toContain('확인');
  });
});

// 챗봇 질문 게이트 — 막아야 할 것만 막고, 멀쩡한 질문은 통과해야 한다.
// 오탐이 나면 실사용 첫날에 "챗봇이 고장 났다"가 된다. 통과 쪽을 더 촘촘히 본다.
describe('findSensitiveIds (챗봇 질문 차단 대상)', () => {
  it('주민등록번호·카드·계좌는 막는다', () => {
    expect(findSensitiveIds('제 번호 901231-1234567 인데요').map((f) => f.kind)).toContain('rrn');
    expect(findSensitiveIds('카드 1234-5678-9012-3456 로 냈어요').map((f) => f.kind)).toContain('card');
    expect(findSensitiveIds('계좌 110-234-567890 으로 입금했어요').map((f) => f.kind)).toContain('account');
  });

  it('전화·이메일은 막지 않는다 — 대화에 정상적으로 나온다', () => {
    expect(findSensitiveIds('010-1234-5678 로 연락 오나요?')).toEqual([]);
    expect(findSensitiveIds('animalmate@gmail.com 로 보내면 되나요?')).toEqual([]);
  });

  it('평범한 동아리 질문은 전부 통과한다', () => {
    for (const q of [
      '이번 주 봉사 언제예요?',
      '회비 얼마예요?',
      '4팀 봉사공지 몇 시에 올라와요?',
      '봉사시간 인정 어떻게 받아요?',
      '운영진 연락처 어디서 봐요?',
      '2026년 1학기 회칙 알려주세요',
      '8월 29일 봉사 장소가 어디죠?',
      '정원 20명 맞나요?',
    ]) {
      expect(findSensitiveIds(q), `막히면 안 되는 질문: ${q}`).toEqual([]);
    }
  });

  it('계좌는 문맥 단어가 있을 때만 — 숫자만 길다고 막지 않는다', () => {
    expect(findSensitiveIds('학번이 20231234567 이에요')).toEqual([]);
  });
});
