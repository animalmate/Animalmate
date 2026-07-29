import { createHash } from 'node:crypto';

/**
 * 운영 Supabase 프로젝트를 식별하는 **순수 함수**들. 부수효과가 없다.
 *
 * 왜 `db-url.ts` 에서 떼어냈는가:
 * `db-url.ts` 는 import 시점에 `TEST_DATABASE_URL` 이 없으면 **던진다**. 그게 그 파일의 목적이다.
 * 그런데 `rls.security.test.ts` 는 `TEST_DATABASE_URL` 을 쓰지 않고(운영을 봐야 하는 테스트다),
 * `rls-prod` CI 잡에는 그 시크릿이 **주입되지 않는다**. 그래서 거기서 `db-url.ts` 를 import 하면
 * 잡 전체가 죽는다. 두 테스트가 같은 판별 로직을 써야 하므로 순수한 부분만 이 파일로 옮겼다.
 */

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * 운영 프로젝트 ref 의 SHA-256.
 *
 * 왜 해시인가: 이 리포는 public 이다. ref 자체가 비밀은 아니지만(키 없이는 아무것도 못 한다)
 * 지금까지 리포에 나온 적이 없고 굳이 공개할 이유도 없다. 해시로 두면 **공개하지 않고도
 * 똑같이 판별할 수 있다.** 값을 다시 계산하려면:
 *   node -e "console.log(require('node:crypto').createHash('sha256').update('<ref>').digest('hex'))"
 */
export const PROD_REF_SHA256 = '451b79d23d7defe66b7a021310f294c096a6f6c8ae54d23e840878111f3b9a5d';

/** URL 에서 Supabase 프로젝트 ref 를 뽑는다. Supabase 가 아니면 null(로컬 Postgres 등). */
export function projectRef(url: string): string | null {
  try {
    const u = new URL(url);
    // 풀러 연결: 사용자명이 `postgres.<ref>` 다. 운영·테스트가 **호스트를 공유**하므로
    // (둘 다 aws-1-ap-northeast-2.pooler.supabase.com, DB 이름도 둘 다 postgres)
    // 호스트로 구분하려는 시도는 반드시 실패한다. ref 만이 유일한 구분자다.
    const pooler = /^postgres\.([a-z0-9]{16,})$/.exec(decodeURIComponent(u.username));
    if (pooler) return pooler[1] ?? null;
    // 직접 연결: db.<ref>.supabase.co
    const direct = /^db\.([a-z0-9]{16,})\.supabase\.co$/.exec(u.hostname);
    if (direct) return direct[1] ?? null;
    return null;
  } catch {
    return null;
  }
}

/**
 * 이 URL 이 운영 프로젝트를 가리키는가. URL 안의 ref 모양 토큰을 전부 해시로 대조한다
 * ("URL 어디에든 포함되면 참"). 사용자명·호스트 어느 쪽에 있든 잡힌다.
 */
export function looksLikeProduction(url: string): boolean {
  const tokens = url.toLowerCase().match(/[a-z0-9]{20}/g) ?? [];
  return tokens.some((t) => sha256(t) === PROD_REF_SHA256);
}
