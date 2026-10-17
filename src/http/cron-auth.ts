// 크론 엔드포인트 인증 — Authorization: Bearer <CRON_SECRET> 검증.
// 02-TECH-STACK §4: CRON_SECRET 검증 없이는 무조건 401. 타이밍 공격 방지로 상수시간 비교.

import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (s: string): Buffer => createHash('sha256').update(s).digest();

export function isAuthorizedCron(authHeader: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || !authHeader) return false;
  // 양쪽을 같은 길이의 해시로 바꿔 비교한다. 원문 길이를 먼저 견주고 다르면 곧바로 돌려주면,
  // 응답 시간으로 시크릿 **길이**가 새어 나간다(timingSafeEqual 은 같은 길이만 받는다).
  return timingSafeEqual(digest(authHeader), digest(`Bearer ${secret}`));
}
