import 'server-only'; // 이 모듈이 클라이언트 번들에 들어가면 빌드 에러(서버 전용 강제).
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// 데이터 접근은 전부 서버(service role) 경유(규칙 #8, 02-TECH-STACK §4).
// DATABASE_URL = Supabase Postgres 연결 문자열. 브라우저에 절대 노출하지 않는다.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL 이 설정되지 않았습니다(서버 환경변수). .env 를 확인하세요.');
}

// 서버리스(Vercel)에서 커넥션 폭주를 막기 위해 풀 크기를 제한한다.
const client = postgres(connectionString, { prepare: false, max: 5 });

export const db = drizzle(client, { schema, casing: 'snake_case' });
export { schema };
