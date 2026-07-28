import { defineConfig } from 'vitest/config';

// **운영 DB 를 대상으로 하는 소수의 테스트 전용 설정.** 각각 전용 스크립트로 골라서 돌린다
// (`npm run test:rls:prod`, `npm run test:e2e`, `npm run eval`). CI 는 RLS 거부 스위트만 돌린다.
// 셋 다 필요한 환경변수가 없으면 스스로 skip 하므로, 실수로 통째로 돌려도 아무 일도 하지 않는다.
//
// 왜 이런 것이 남아 있는가: 통합 테스트는 전부 테스트 DB 로 옮겼지만(vitest.integration.config.ts),
// 아래 셋은 **대상이 운영이어야만 의미가 있다.**
//   - RLS 거부 증명 — 증명할 대상이 운영의 RLS 다. 2026-07-27 에 drizzle-kit push 가 운영 28개
//     테이블의 RLS 를 꺼 버린 사고를 잡아낸 것이 이 스위트다. 테스트 DB 로 옮기면 그 안전망을
//     잃는다. anon key 로 접근이 거부되는지만 확인하는 **비파괴적**(읽기 시도) 테스트다.
//   - e2e HTTP — 배포된 앱에 붙는다. 그 앱이 보는 DB 와 같아야 한다.
//   - 챗봇 평가 — 실제 지식베이스 품질 측정이라 실 문서가 있어야 한다.
//
// setup-db.ts 를 **일부러 넣지 않는다.** 여기서는 .env 의 운영 DIRECT_URL 을 그대로 쓴다.
export default defineConfig({
  test: {
    include: [
      'test/rls.security.test.ts',
      'test/e2e-http.test.ts',
      'test/chatbot-eval.test.ts',
    ],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      'server-only': new URL('./test/stubs/server-only.ts', import.meta.url).pathname,
    },
  },
});
