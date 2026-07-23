// 크론 엔드포인트 인증 — Authorization: Bearer <CRON_SECRET> 검증.
// 02-TECH-STACK §4: CRON_SECRET 검증 없이는 무조건 401. 타이밍 공격 방지로 상수시간 비교.

import { timingSafeEqual } from 'node:crypto';

export function isAuthorizedCron(authHeader: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || !authHeader) return false;
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false; // 길이 다르면 즉시 실패(상수시간 비교는 동일 길이 전제)
  return timingSafeEqual(a, b);
}
