import { defineConfig } from 'vitest/config';

// RLS 보안 통합 테스트 전용(실제 Supabase 대상, 네트워크 필요).
// 순수 단위 테스트(vitest.config.ts)와 분리 — CI 에서 시크릿 주입 후 `npm run test:rls`.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
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
