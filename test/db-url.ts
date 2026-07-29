import 'dotenv/config';
// 운영 ref 판별은 rls.security.test.ts 와 공유한다(순수 함수, 부수효과 없음).
// 그쪽은 이 파일을 import 할 수 없다 — 이 파일은 TEST_DATABASE_URL 이 없으면 던지는데
// rls-prod 잡에는 그 시크릿이 없기 때문이다. 자세한 사정은 prod-ref.ts 주석 참고.
import { projectRef, looksLikeProduction } from './prod-ref';

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

function assertNotProduction(url: string): void {
  // ① .env 에 운영 URL 이 함께 있으면 그것과 직접 대조한다(가장 정확하다).
  const prodRefs = new Set(
    [process.env.DATABASE_URL, process.env.DIRECT_URL]
      .map((u) => (u ? projectRef(u) : null))
      .filter((r): r is string => r !== null)
  );

  // ② CI 처럼 운영 URL 이 아예 없는 환경에서는 ①이 비어 있다. 그때도 막으려고
  //    URL 안의 ref 모양 토큰을 전부 해시로 대조한다("URL 어디에든 포함되면 실패").
  const hitsHash = looksLikeProduction(url);

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
