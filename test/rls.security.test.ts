import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import postgres from 'postgres';

// ── 목적 ───────────────────────────────────────────────────────────────
// CLAUDE.md 규칙 #8: 전 테이블 RLS 활성화(정책 미부여 = 기본 거부). anon key 로는 어떤
// 테이블도 직접 읽고 쓸 수 없어야 한다. 이 테스트는 그것을 "증명"하고, CI 에서 상시 돌린다.
//
// ── 구조적 자동 포함 ───────────────────────────────────────────────────
// 검사 대상 테이블을 코드에 하드코딩하지 않고 pg_tables 에서 런타임에 수집한다.
// → 새 테이블이 (마이그레이션이든 대시보드든 raw SQL 이든) 추가되면 자동으로 검사 대상이 되고,
//   RLS 를 깜빡하면 이 테스트가 즉시 실패한다(누락을 구조적으로 차단).

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

const haveEnv = Boolean(SUPABASE_URL && ANON_KEY && DIRECT_URL);
// 환경변수가 없으면(로컬 무설정) 건너뛴다. CI 에서는 시크릿을 주입해 반드시 실행한다.
const suite = haveEnv ? describe : describe.skip;

type PublicTable = { tablename: string; rowsecurity: boolean };

// public 스키마의 모든 테이블 + RLS 활성화 여부를 DB 에서 직접 읽는다(권위 있는 목록).
async function listPublicTables(): Promise<PublicTable[]> {
  const sql = postgres(DIRECT_URL!, { prepare: false, max: 1 });
  try {
    return await sql<PublicTable[]>`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// PostgREST 를 anon key 로 호출(브라우저가 할 수 있는 최대치를 재현).
function anonHeaders(): Record<string, string> {
  return { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY}` };
}

async function anonSelect(table: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
    headers: anonHeaders(),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* 본문 없음 */
  }
  return { status: res.status, body };
}

async function anonInsert(table: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...anonHeaders(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({}),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* 본문 없음 */
  }
  return { status: res.status, body };
}

// 테이블 목록을 모듈 로드 시점에 수집(top-level await) → 각 테이블별 테스트를 동적으로 생성.
const tables: PublicTable[] = haveEnv ? await listPublicTables() : [];

suite('RLS 기본 거부 — 전 public 테이블', () => {
  it('public 테이블이 1개 이상 수집된다(수집 자체가 동작하는지 확인)', () => {
    expect(tables.length).toBeGreaterThan(0);
  });

  for (const t of tables) {
    describe(`테이블: ${t.tablename}`, () => {
      it('RLS 가 활성화되어 있다(rowsecurity=true)', () => {
        expect(
          t.rowsecurity,
          `"${t.tablename}" 에 RLS 가 비활성 상태다. 마이그레이션에 ` +
            `ALTER TABLE "${t.tablename}" ENABLE ROW LEVEL SECURITY; 를 추가하라(규칙 #8).`
        ).toBe(true);
      });

      it('anon SELECT 은 어떤 행도 반환하지 않는다', async () => {
        const { status, body } = await anonSelect(t.tablename);
        if (status === 200) {
          const count = Array.isArray(body) ? body.length : 0;
          expect(count, `"${t.tablename}" anon SELECT 이 데이터를 노출했다(누출).`).toBe(0);
        } else {
          // 401/403/404 등도 안전(접근 거부). 유일한 위험은 200 + 행 반환.
          expect(status).toBeGreaterThanOrEqual(400);
        }
      });

      it('anon INSERT 은 거부된다(2xx 아님)', async () => {
        const { status } = await anonInsert(t.tablename);
        expect(
          status,
          `"${t.tablename}" anon INSERT 가 성공(2xx)했다. RLS WITH CHECK 정책이 쓰기를 막지 못한다.`
        ).toBeGreaterThanOrEqual(400);
      });
    });
  }
});
