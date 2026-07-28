import 'dotenv/config';
import { createHash } from 'node:crypto';

/**
 * 통합 테스트가 붙을 DB 를 정한다. **`TEST_DATABASE_URL` 하나만 본다.**
 *
 * 왜 이 파일이 생겼는가:
 * 예전에는 24개 통합 테스트 파일이 전부 이렇게 시작했다.
 *
 *     const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
 *     const suite = DIRECT_URL ? describe : describe.skip;
 *
 * 그래서 `.env` 가 있는 개발자 머신에서 `npm run test:rls` 를 치면 **운영 DB 에 붙었다.**
 * 이 테스트들은 읽기만 하지 않는다 — 회원·지원자·예약 행을 만들고 지운다. 규약(`@example.invalid`
 * + 멱등 cleanup)으로 사고를 피해 왔지만, 그건 사람이 규약을 지킬 때만 성립하는 안전이다.
 * 폴백을 없애고 대상을 하나로 못 박아, "로컬 테스트가 운영 DB 에 닿는" 상태 자체를 없앤다.
 *
 * 설정이 없으면 **skip 이 아니라 하드 실패**시킨다. skip 은 초록으로 보이지만 아무것도
 * 증명하지 않는다 — CI 가 13초 만에 끝나고 통과했다고 말하던 그 상태로 돌아가지 않는다.
 */

/** URL 에서 Supabase 프로젝트 ref 를 뽑는다. Supabase 가 아니면 null(로컬 Postgres 등). */
function projectRef(url: string): string | null {
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

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * 운영 프로젝트 ref 의 SHA-256.
 *
 * 왜 해시인가: 이 리포는 public 이다. ref 자체가 비밀은 아니지만(키 없이는 아무것도 못 한다)
 * 지금까지 리포에 나온 적이 없고 굳이 공개할 이유도 없다. 해시로 두면 **공개하지 않고도
 * 똑같이 막을 수 있다.** 값을 다시 계산하려면:
 *   node -e "console.log(require('node:crypto').createHash('sha256').update('<ref>').digest('hex'))"
 */
const PROD_REF_SHA256 = '451b79d23d7defe66b7a021310f294c096a6f6c8ae54d23e840878111f3b9a5d';

function assertNotProduction(url: string): void {
  // ① .env 에 운영 URL 이 함께 있으면 그것과 직접 대조한다(가장 정확하다).
  const prodRefs = new Set(
    [process.env.DATABASE_URL, process.env.DIRECT_URL]
      .map((u) => (u ? projectRef(u) : null))
      .filter((r): r is string => r !== null)
  );

  // ② CI 처럼 운영 URL 이 아예 없는 환경에서는 ①이 비어 있다. 그때도 막으려고
  //    URL 안의 ref 모양 토큰을 전부 해시로 대조한다("URL 어디에든 포함되면 실패").
  const tokens = url.toLowerCase().match(/[a-z0-9]{20}/g) ?? [];
  const hitsHash = tokens.some((t) => sha256(t) === PROD_REF_SHA256);

  const ref = projectRef(url);
  if (hitsHash || (ref !== null && prodRefs.has(ref))) {
    throw new Error(
      'TEST_DATABASE_URL 이 **운영 프로젝트**를 가리키고 있습니다. 통합 테스트는 행을 만들고 지우므로 ' +
        '운영 데이터가 손상됩니다.\n' +
        '  테스트 전용 Supabase 프로젝트(animalmate-test)의 세션 풀러(5432) URL 로 바꾸세요.'
    );
  }
}

function resolve(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL 이 없습니다. 통합 테스트는 **테스트 전용 DB** 에서만 돕니다.\n' +
        '  로컬: .env 에 TEST_DATABASE_URL 을 넣으세요(테스트 Supabase 프로젝트의 5432 세션 풀러).\n' +
        '  CI  : Actions 시크릿 TEST_DATABASE_URL 을 등록하세요.\n' +
        '  스키마가 비어 있으면 먼저 `npm run db:migrate:test` 를 돌리세요.\n' +
        '  (운영 DIRECT_URL 로 폴백하지 않습니다 — 그게 이 파일이 생긴 이유입니다.)'
    );
  }
  assertNotProduction(url);
  return url;
}

/**
 * 통합 테스트 대상 DB URL. import 시점에 검증한다 — 잘못된 설정으로는 테스트가 **시작조차
 * 하지 않는다**(한 파일이라도 운영에 붙는 것보다 전부 실패하는 편이 낫다).
 */
export const TEST_DATABASE_URL: string = resolve();

// 테스트에서 쓰라고 내보낸다. 진단 메시지에 어느 DB 였는지 적을 때 값(비밀번호 포함)을
// 그대로 찍지 않기 위한 것.
export const TEST_DB_LABEL = `supabase:${projectRef(TEST_DATABASE_URL) ?? 'non-supabase'}`;
