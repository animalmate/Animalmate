import { defineConfig } from 'vitest/config';

// RLS 보안 통합 테스트 전용(실제 Supabase 대상, 네트워크 필요).
// 순수 단위 테스트(vitest.config.ts)와 분리 — CI 에서 시크릿 주입 후 `npm run test:rls`.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
});
