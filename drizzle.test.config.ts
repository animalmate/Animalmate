import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// **테스트 DB 전용** 마이그레이션 설정(`npm run db:migrate:test`).
// drizzle.config.ts 와 out/schema 는 같고 접속 대상만 TEST_DATABASE_URL 이다 — 운영과 테스트가
// 같은 마이그레이션을 적용받아야 테스트가 의미를 갖는다.
//
// `drizzle-kit push` 는 여기서도 금지다(CLAUDE.md). push 는 schema.ts 에 RLS 선언이 없는 것을 보고
// public 전 테이블의 RLS 를 꺼 버린다 — 2026-07-27 에 운영에서 실제로 겪은 사고이고,
// 복원 리허설 중에는 테스트 DB 에 운영 PII 가 들어 있을 수 있어 결과가 같다.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.TEST_DATABASE_URL ?? '' },
  casing: 'snake_case',
  verbose: true,
  strict: true,
});
