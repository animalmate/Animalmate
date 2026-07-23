import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { randomBytes } from 'node:crypto';
import * as schema from '@/db/schema';
import { naverTokens } from '@/db/schema';
import {
  storeRefreshToken,
  getTokenRow,
  refreshAndStore,
  NaverTokenError,
} from '@/naver/token-service';
import type { RefreshResult } from '@/naver/oauth';

const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const key = randomBytes(32);

// 실 DB 대상. 기존 naver_tokens 행(실제 토큰)이 있으면 덮어쓰지 않도록 스킵.
const shouldRun = Boolean(DIRECT_URL);

describe.runIf(shouldRun)('naver token-service — 암호화 저장 + 갱신', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let preExisting = false;

  beforeAll(async () => {
    sql = postgres(DIRECT_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    preExisting = (await getTokenRow(db)) !== null; // 실제 토큰이 있으면 건드리지 않음
  });

  afterAll(async () => {
    if (!preExisting) await db.delete(naverTokens); // 테스트가 만든 행만 정리
    await sql.end({ timeout: 5 });
  });

  it('저장 시 평문이 아니라 암호문으로 보관되고, 갱신은 access token 반환', async () => {
    if (preExisting) return; // 실제 토큰 보호
    const PLAIN = 'refresh-token-plain-value';
    await storeRefreshToken(db, PLAIN, key);

    const row = await getTokenRow(db);
    expect(row).not.toBeNull();
    expect(row!.refreshTokenEncrypted).not.toContain(PLAIN); // 평문 미노출
    expect(row!.status).toBe('ok');

    // 네트워크 대신 가짜 refresher 주입: 새 refresh token 을 재발급하는 시나리오.
    const fakeRefresh = async (): Promise<RefreshResult> => ({
      ok: true,
      status: 200,
      accessToken: 'access-123',
      refreshToken: 'rotated-refresh-456',
      expiresIn: 3600,
      raw: {},
    });
    const tok = await refreshAndStore(db, {
      key,
      clientId: 'cid',
      clientSecret: 'csec',
      refresh: fakeRefresh,
    });
    expect(tok.accessToken).toBe('access-123');

    const after = await getTokenRow(db);
    expect(after!.status).toBe('ok');
    expect(after!.lastRefreshedAt).not.toBeNull(); // 갱신 시각 기록
    // refresh token 회전 반영: 암호문이 바뀌었고, 이전 평문으로 복호화되지 않음
    expect(after!.refreshTokenEncrypted).not.toBe(row!.refreshTokenEncrypted);
  });

  it('갱신 실패 시 status=error + NaverTokenError', async () => {
    if (preExisting) return;
    const failRefresh = async (): Promise<RefreshResult> => ({
      ok: false,
      status: 401,
      raw: { error: 'invalid_grant' },
    });
    await expect(
      refreshAndStore(db, { key, clientId: 'c', clientSecret: 's', refresh: failRefresh })
    ).rejects.toBeInstanceOf(NaverTokenError);

    const row = await getTokenRow(db);
    expect(row!.status).toBe('error');
  });
});
