import { defineConfig } from 'vitest/config';

// 순수 로직 단위 테스트(권한 검사, 반복 규칙 날짜 계산, 발행 상태머신, visibility 필터).
// CLAUDE.md: 이 항목들은 반드시 단위 테스트 작성.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
});
