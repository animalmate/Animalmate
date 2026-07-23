// 서비스가 받는 db 는 일반 연결 또는 트랜잭션 둘 다 될 수 있다. 공용 타입 별칭.
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** 일반 db 또는 트랜잭션(tx). recordAudit 등 트랜잭션 내부에서도 호출되는 함수에 사용. */
export type Database = Db | Tx;
