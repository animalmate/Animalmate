import 'server-only'; // 이 모듈이 클라이언트 번들에 들어가면 빌드 에러(서버 전용 강제).
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// 데이터 접근은 전부 서버(service role) 경유(규칙 #8, 02-TECH-STACK §4).
// DATABASE_URL = Supabase Postgres 연결 문자열. 브라우저에 절대 노출하지 않는다.
function createDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL 이 설정되지 않았습니다(서버 환경변수). .env 를 확인하세요.');
  }
  // 서버리스(Vercel)에서 커넥션 폭주를 막기 위해 풀 크기를 제한한다.
  const client = postgres(connectionString, { prepare: false, max: 5 });
  return drizzle(client, { schema, casing: 'snake_case' });
}

type Db = ReturnType<typeof createDb>;

let instance: Db | null = null;

function getDb(): Db {
  instance ??= createDb();
  return instance;
}

// **연결은 import 시점이 아니라 첫 사용 시점에 만든다.**
// 예전에는 모듈 최상단에서 DATABASE_URL 을 검사하고 없으면 곧바로 throw 했다. 그런데 recruit
// 서비스들(lookup/scores/purge…)은 이 싱글턴을 top-level import 하므로, DATABASE_URL 없는
// 환경에서는 "파일을 import 했다"는 사실만으로 터졌다. 통합 테스트는 env 가 없으면 스스로
// describe.skip 으로 건너뛰게 설계돼 있는데, 그 가드는 import 가 끝난 뒤에야 평가되므로
// 아무 소용이 없었다 — 시크릿 미등록 CI 에서 수집 단계가 통째로 실패했다(2026-07-27).
// Proxy 로 감싸 첫 프로퍼티 접근까지 연결 생성을 미루면, 실제로 DB 를 쓰는 코드에서만
// 같은 에러가 나고 단순 import 는 안전해진다.
export const db = new Proxy({} as Db, {
  get(_target, prop) {
    // 메서드는 실제 drizzle 인스턴스에 바인딩한다. this 가 Proxy 로 새면 drizzle 내부의
    // private 필드 접근이 깨진다.
    const value = Reflect.get(getDb() as object, prop) as unknown;
    return typeof value === 'function' ? value.bind(getDb()) : value;
  },
  has(_target, prop) {
    return Reflect.has(getDb() as object, prop);
  },
});

export { schema };
