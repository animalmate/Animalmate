import { describe, it, expect } from 'vitest';
import { wouldRemoveLastPrivileged, isDemotion, withdrawBlockReason } from './members';

// 강등 판정 = "권한이 줄었는가". 줄었으면 세션을 끊는다(결정 13).
describe('isDemotion — 강등 판정', () => {
  it('등급이 내려가면 강등', () => {
    expect(isDemotion('board', 'staff')).toBe(true);
    expect(isDemotion('board', 'member')).toBe(true);
    expect(isDemotion('staff', 'member')).toBe(true);
  });

  it('등급이 올라가면 강등이 아니다(승격은 세션을 끊지 않는다)', () => {
    expect(isDemotion('member', 'staff')).toBe(false);
    expect(isDemotion('staff', 'board')).toBe(false);
    expect(isDemotion('member', 'sysadmin')).toBe(false);
    expect(isDemotion('board', 'sysadmin')).toBe(false); // 같은 등급이지만 권한은 늘어난다
  });

  it('sysadmin → 그 외는 등급이 같아도 강등(sysadmin 전용 조작을 잃는다)', () => {
    expect(isDemotion('sysadmin', 'board')).toBe(true);
    expect(isDemotion('sysadmin', 'staff')).toBe(true);
  });

  it('역할이 그대로면 강등이 아니다', () => {
    for (const r of ['member', 'staff', 'board', 'sysadmin'] as const) {
      expect(isDemotion(r, r)).toBe(false);
    }
  });
});

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

// 탈퇴는 되돌릴 수 없다 — 막아야 하는 경우를 여기서 못박는다.
// (실제 판단은 "DB 전체의 활성 권한자 수"라는 전역 상태에 달려 있어 공용 DB 통합테스트로는 만들 수 없다)
describe('withdrawBlockReason — 탈퇴 차단 규칙', () => {
  const base = { isSelf: false, actorRole: 'board' as const, targetRole: 'member' as const, activePrivileged: 3, activeSysadmin: 1 };

  it('평범한 부원 탈퇴는 막지 않는다', () => {
    expect(withdrawBlockReason(base)).toBeNull();
  });

  it('본인 탈퇴는 허용한다 — 비활성화와 달리 self_forbidden 이 아니다', () => {
    expect(withdrawBlockReason({ ...base, isSelf: true, actorRole: 'member' })).toBeNull();
    expect(withdrawBlockReason({ ...base, isSelf: true, actorRole: 'staff', targetRole: 'staff' })).toBeNull();
  });

  it('마지막 권한자는 본인이든 남이든 탈퇴 불가 — 나가면 아무도 권한을 되돌릴 수 없다', () => {
    expect(withdrawBlockReason({ ...base, targetRole: 'board', activePrivileged: 1 })).toBe('last_privileged');
    expect(withdrawBlockReason({ ...base, isSelf: true, actorRole: 'board', targetRole: 'board', activePrivileged: 1 })).toBe('last_privileged');
  });

  it('권한자가 여럿이면 회장단도 탈퇴할 수 있다', () => {
    expect(withdrawBlockReason({ ...base, targetRole: 'board', activePrivileged: 2 })).toBeNull();
  });

  it('시스템관리자를 내보낼 수 있는 것은 시스템관리자뿐', () => {
    expect(withdrawBlockReason({ ...base, actorRole: 'board', targetRole: 'sysadmin', activeSysadmin: 2 })).toBe('sysadmin_only');
    expect(withdrawBlockReason({ ...base, actorRole: 'sysadmin', targetRole: 'sysadmin', activeSysadmin: 2 })).toBeNull();
  });

  it('마지막 시스템관리자는 본인도 탈퇴 불가', () => {
    expect(withdrawBlockReason({ ...base, isSelf: true, actorRole: 'sysadmin', targetRole: 'sysadmin', activeSysadmin: 1 })).toBe('last_sysadmin');
  });

  it('활성 멤버십이 없는 계정(targetRole=null)은 막을 이유가 없다', () => {
    expect(withdrawBlockReason({ ...base, targetRole: null })).toBeNull();
  });
});
