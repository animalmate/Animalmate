import { defineConfig } from 'vitest/config';

// 통합 테스트 — **테스트 전용 DB(TEST_DATABASE_URL)** 대상. 순수 단위 테스트는 vitest.config.ts.
//
// 대상 DB 는 test/db-url.ts 가 정하고, 운영을 가리키면 하드 실패시킨다.
// setup-db.ts 가 DATABASE_URL/DIRECT_URL 까지 테스트 DB 로 덮어, 서비스 싱글턴도 함께 옮긴다.
//
// 아래 3개는 **본질적으로 운영을 대상으로 하는 것들**이라 여기서 뺀다(vitest.prod.config.ts).
//   - rls.security.test.ts : 증명해야 할 대상이 운영의 RLS 다. 테스트 DB 에서 통과해도 07-27 같은
//                            사고(운영 RLS 해제)를 잡지 못한다. 비파괴적(읽기 전용 거부 확인)이다.
//   - e2e-http.test.ts     : 배포된 앱(BASE)에 HTTP 로 붙는다. 그 앱이 보는 DB 와 같은 DB 여야
//                            의미가 있는데, 배포본이 보는 것은 운영 DB 다.
//   - chatbot-eval.test.ts : 실제 지식베이스 품질을 재는 것이다. 빈 테스트 DB 에서 돌리면
//                            전부 핸드오프가 나와 측정 자체가 무의미하다.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: [
      'test/rls.security.test.ts',
      'test/e2e-http.test.ts',
      'test/chatbot-eval.test.ts',
    ],
    setupFiles: ['./test/setup-db.ts'],
    // 실행 하나가 테스트 DB 를 독점하게 한다(어드바이저리 락). CI 가 도는 중에 로컬에서
    // 같은 명령을 돌리면 서로의 픽스처를 지워 둘 다 깨진다 — 2026-07-29 에 실제로 있었다.
    // globalSetup 은 워커마다가 아니라 **실행당 한 번** 돈다. 자세한 사정은 global-lock.ts 주석.
    globalSetup: ['./test/global-lock.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // 통합 테스트는 데이터베이스 하나를 공유한다. 파일을 병렬로 돌리면 서로의 행을 건드려
    // (예: 발행 워커 테스트가 다른 파일이 만든 예약 글을 점유해 버린다) 실패가 뒤섞인다.
    // 실 DB 를 쓰는 테스트는 한 번에 한 파일씩 돈다.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      // 'server-only' 는 서버 컴포넌트 밖 import 를 막는 가드 — 테스트에선 no-op 스텁으로 대체.
      'server-only': new URL('./test/stubs/server-only.ts', import.meta.url).pathname,
    },
  },
});
