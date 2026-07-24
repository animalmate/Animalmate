import { describe, it, expect } from 'vitest';
import { buildAuditEntry } from './audit';

const base = { actorUserId: 'u-1', action: 'membership.set_role', targetTable: 'memberships' };

describe('buildAuditEntry — 표기', () => {
  it('평범한 행위는 action 을 그대로 둔다', () => {
    expect(buildAuditEntry(base).action).toBe('membership.set_role');
  });

  it('소유권 우회는 [override]', () => {
    expect(buildAuditEntry({ ...base, override: true }).action).toBe('membership.set_role [override]');
  });

  it('회장단 대상 변경은 [high] — 상호 견제를 차단이 아니라 가시성으로 하므로 눈에 띄어야 한다', () => {
    expect(buildAuditEntry({ ...base, severity: 'high' }).action).toBe('membership.set_role [high]');
  });

  it('둘 다면 둘 다 표기된다', () => {
    expect(buildAuditEntry({ ...base, override: true, severity: 'high' }).action).toBe(
      'membership.set_role [override] [high]'
    );
  });

  it('before/after 는 없으면 null 로 채운다(컬럼이 not null 이 아니어도 형태를 고정)', () => {
    const e = buildAuditEntry(base);
    expect(e.beforeJson).toBeNull();
    expect(e.afterJson).toBeNull();
    expect(e.targetId).toBeNull();
  });
});
