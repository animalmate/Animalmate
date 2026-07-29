import 'dotenv/config';

/**
 * RAG 통합 테스트(실 임베딩·실 생성 호출)가 돌 수 있는 환경인지 판정한다.
 *
 * 왜 이 파일이 생겼는가:
 * 예전에는 두 파일이 각자 이렇게 시작했다.
 *
 *     const suite = process.env.GEMINI_API_KEY ? describe : describe.skip;
 *
 * 그런데 **`GEMINI_API_KEY` 가 리포 시크릿에 아예 없었다.** `ci.yml` 은
 * `${{ secrets.GEMINI_API_KEY }}` 를 참조했지만 없는 시크릿은 빈 문자열이 되고,
 * 그대로 `describe.skip` 으로 빠지면서 **CI 가 초록이 됐다**. 2026-07-29 에 발견할 때까지
 * `rag-visibility`(6개)·`chatbot-answer`(3개) 9개가 한 번도 실행된 적이 없었다
 * — 즉 챗봇 검색과 pgvector 경로를 CI 가 전혀 검증하지 않고 있었다(0021 로 확장을 옮긴 뒤라 더 위험했다).
 *
 * 키만으로도 부족하다: `src/rag/gemini.ts` 는 모델 ID(`GEMINI_MODEL`,
 * `GEMINI_EMBEDDING_MODEL`)가 없으면 던진다. 셋을 함께 봐야 "돌 수 있다"가 참이 된다.
 *
 * **CI 에서는 skip 을 금지한다(하드 실패).** skip 은 초록으로 보이지만 아무것도 증명하지 않는다.
 * 반면 **로컬에서는 skip 을 허용한다** — `db-url.ts` 가 어디서나 하드 실패하는 것과 다르다.
 * 이유가 다르기 때문이다: TEST_DATABASE_URL 이 없으면 **운영 DB 에 붙을 위험**이 있지만,
 * Gemini 키가 없는 것은 위험이 아니라 그냥 못 도는 것이고, 이 테스트는 **과금되는 외부 API** 를
 * 실제로 호출한다. 키가 없는 사람이 나머지 통합 테스트까지 못 돌리게 만들 이유는 없다.
 * 막아야 할 것은 "CI 가 조용히 건너뛰고 통과했다고 말하는 것" 하나다.
 */

const REQUIRED = ['GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_EMBEDDING_MODEL'] as const;

const missing = REQUIRED.filter((k) => !process.env[k]?.trim());

if (missing.length > 0 && process.env.CI) {
  throw new Error(
    `CI 에서 RAG 통합 테스트에 필요한 환경변수가 없습니다: ${missing.join(', ')}\n` +
      '  이 테스트들을 skip 으로 넘기면 챗봇 검색·pgvector 경로가 무검증 상태가 됩니다.\n' +
      '  GEMINI_API_KEY : Actions 시크릿으로 등록하세요.\n' +
      '  GEMINI_MODEL / GEMINI_EMBEDDING_MODEL : 비밀이 아니므로 ci.yml 의 env 에 평문으로 두세요\n' +
      '    (값은 .env·Vercel 과 같아야 합니다).'
  );
}

/**
 * RAG 테스트를 돌릴 수 있는가. 로컬에서 설정이 없으면 false(= describe.skip).
 * CI 에서는 위에서 이미 던졌으므로 여기 도달하면 언제나 true 다.
 */
export const GEMINI_READY: boolean = missing.length === 0;
