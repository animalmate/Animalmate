import 'dotenv/config';
import { looksLikeProduction } from './prod-ref';

/**
 * RLS 기본 거부 증명(`rls.security.test.ts`)이 **의미 있게** 돌 수 있는 환경인지 판정한다.
 *
 * 왜 이 파일이 생겼는가:
 * 예전에는 그 파일이 이렇게 시작했다.
 *
 *     const haveEnv = Boolean(SUPABASE_URL && ANON_KEY && DIRECT_URL);
 *     const suite = haveEnv ? describe : describe.skip;
 *
 * `gemini-env.ts` 를 만들게 한 것과 **똑같은 구조의 구멍**이다. CI 시크릿이 사라지거나 이름이
 * 바뀌면 스위트가 통째로 skip 되면서 잡이 초록으로 끝난다. 하필 이 잡은 2026-07-27 사고
 * (drizzle-kit push 가 운영 28개 테이블의 RLS 를 해제)를 잡으라고 만든 것이라, 조용히 꺼지면
 * **가장 필요할 때 아무것도 못 잡는다.**
 *
 * 두 가지를 본다:
 *
 * ① **설정이 있는가.** 없으면 — CI 에서는 하드 실패, 로컬에서는 skip 허용.
 *    (`db-url.ts` 가 어디서나 하드 실패하는 것과 다르다. 그쪽은 없으면 *운영 DB 에 붙을 위험*이
 *    있지만, 여기는 없으면 그냥 못 도는 것이다. 이 테스트는 읽기 시도만 하는 비파괴 테스트다.)
 *
 * ② **그 DIRECT_URL 이 정말 운영인가.** 이게 이 파일의 핵심이다. 이 테스트는 **운영의 RLS 를
 *    증명하는 것이 목적**이라(`ci.yml` 주석: "테스트 DB 에서 통과해도 2026-07-27 사고를 잡지
 *    못한다"), 대상이 테스트 프로젝트로 바뀌면 82개가 전부 통과해도 **증명한 것이 없다.**
 *    초록인데 무의미한 상태 — skip 과 똑같이 위험하다. 그래서 설정이 있으면 로컬이든 CI 든
 *    운영을 가리키는지 확인하고, 아니면 던진다.
 */

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'DIRECT_URL'] as const;

const missing = REQUIRED.filter((k) => !process.env[k]?.trim());

if (missing.length > 0 && process.env.CI) {
  throw new Error(
    `CI 에서 RLS 증명에 필요한 환경변수가 없습니다: ${missing.join(', ')}\n` +
      '  이 스위트를 skip 으로 넘기면 잡이 초록이 되면서 운영 RLS 를 아무도 확인하지 않습니다.\n' +
      '  Actions 시크릿 SUPABASE_URL / SUPABASE_ANON_KEY / DIRECT_URL 을 등록하세요.'
  );
}

// 설정이 갖춰졌다면, 그 대상이 운영인지까지 확인한다. 테스트 DB 를 가리킨 채 통과하는 것은
// 통과가 아니다 — 증명해야 할 대상이 운영의 RLS 이기 때문이다.
if (missing.length === 0 && !looksLikeProduction(process.env.DIRECT_URL!)) {
  throw new Error(
    'DIRECT_URL 이 **운영 프로젝트가 아닙니다.**\n' +
      '  이 테스트는 운영의 RLS 기본 거부를 증명하는 것이 목적입니다. 테스트 프로젝트를 상대로는\n' +
      '  82개가 전부 통과해도 증명한 것이 없습니다(2026-07-27 사고를 잡지 못합니다).\n' +
      '  통합 테스트를 돌리려던 것이라면 `npm run test:integration` 을 쓰세요.'
  );
}

/**
 * RLS 증명을 돌릴 수 있는가. 로컬에서 설정이 없으면 false(= describe.skip).
 * CI 에서는 위에서 이미 던졌으므로 여기 도달하면 언제나 true 다.
 */
export const RLS_ENV_READY: boolean = missing.length === 0;
