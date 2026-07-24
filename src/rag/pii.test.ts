import { describe, it, expect } from 'vitest';
import { detectPii, piiWarning } from './pii';

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
