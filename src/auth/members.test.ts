import { describe, it, expect } from 'vitest';
import { wouldRemoveLastPrivileged } from './members';

// 회장단끼리는 상호 신뢰가 전제다(회장단 교체·유고 대응을 회장단이 스스로 해야 하므로).
// 코드가 막는 것은 딱 하나 — "아무도 권한을 되돌릴 수 없게 되는" 전원 잠금뿐이다.
describe('wouldRemoveLastPrivileged — 전원 잠금 방지', () => {
  it('마지막 회장단 강등은 막는다', () => {
    expect(wouldRemoveLastPrivileged('board', 'staff', 1)).toBe(true);
    expect(wouldRemoveLastPrivileged('board', 'member', 1)).toBe(true);
  });

  it('마지막 회장단 비활성화(newRole=null)도 막는다', () => {
    expect(wouldRemoveLastPrivileged('board', null, 1)).toBe(true);
    expect(wouldRemoveLastPrivileged('sysadmin', null, 1)).toBe(true);
  });

  it('권한자가 둘 이상이면 강등할 수 있다 — 회장단 교체는 회장단이 스스로 한다', () => {
    expect(wouldRemoveLastPrivileged('board', 'staff', 2)).toBe(false);
    expect(wouldRemoveLastPrivileged('board', 'member', 5)).toBe(false);
  });

  it('권한자 → 권한자(board ↔ sysadmin)는 한 명뿐이어도 안전', () => {
    expect(wouldRemoveLastPrivileged('board', 'sysadmin', 1)).toBe(false);
    expect(wouldRemoveLastPrivileged('sysadmin', 'board', 1)).toBe(false);
  });

  it('애초에 권한자가 아니면 상관없다', () => {
    expect(wouldRemoveLastPrivileged('staff', 'member', 1)).toBe(false);
    expect(wouldRemoveLastPrivileged('member', null, 1)).toBe(false);
    expect(wouldRemoveLastPrivileged(null, null, 1)).toBe(false);
  });

  it('권한자가 0 인 비정상 상태에서도 강등을 막는다(더 나빠지지 않게)', () => {
    expect(wouldRemoveLastPrivileged('board', 'member', 0)).toBe(true);
  });
});
