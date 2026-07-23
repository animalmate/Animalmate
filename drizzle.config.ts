import 'dotenv/config'; // .env 로드(drizzle-kit 은 자동 로드하지 않음)
import { defineConfig } from 'drizzle-kit';

// 03-DATA-MODEL 스키마 → 마이그레이션 파일 생성/적용.
// DATABASE_URL(Supabase Postgres 직접 연결 문자열)은 .env 에만 둔다(커밋 금지).
// 마이그레이션(DDL)은 세션 풀러/직접 연결(5432)을 쓸 것 — 트랜잭션 풀러(6543)는 DDL 부적합.
// generate(오프라인)는 URL 없이 동작하고, migrate/push 는 실제 URL 이 필요하다.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  // 마이그레이션(DDL)은 세션 풀러(5432)=DIRECT_URL 로. 없으면 DATABASE_URL 로 폴백.
  dbCredentials: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '' },
  casing: 'snake_case',
  verbose: true,
  strict: true,
});
