import { describe, it, expect } from 'vitest';
import { isAuthorizedCron } from './cron-auth';

const SECRET = 'super-secret-value';

describe('isAuthorizedCron', () => {
  it('올바른 Bearer 시크릿 → 통과', () => {
    expect(isAuthorizedCron(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it('틀린 시크릿 → 거부', () => {
    expect(isAuthorizedCron('Bearer wrong', SECRET)).toBe(false);
  });

  it('헤더 없음 → 거부', () => {
    expect(isAuthorizedCron(null, SECRET)).toBe(false);
    expect(isAuthorizedCron(undefined, SECRET)).toBe(false);
  });

  it('서버에 시크릿 미설정 → 거부(무조건 401)', () => {
    expect(isAuthorizedCron(`Bearer ${SECRET}`, undefined)).toBe(false);
  });

  it('Bearer 접두사 없음 → 거부', () => {
    expect(isAuthorizedCron(SECRET, SECRET)).toBe(false);
  });
});
