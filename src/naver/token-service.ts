// naver_tokens 서비스 — refresh token 암호화 저장 + access token 자동 갱신.
// 03: naver_tokens(id, refresh_token_encrypted, last_refreshed_at, status[ok|error]). 단일 활성 토큰 1행.
//
// 외부 API 실패 전제(규칙 #5): 갱신 실패 시 status='error' 로 남기고 NaverTokenError 를 던진다
// (호출부 = 크론이 재시도/운영진 알림 처리). access token 은 짧은 수명이라 DB 에 저장하지 않고 반환만.

import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { naverTokens } from '@/db/schema';
import type * as schema from '@/db/schema';
import { encryptToken, decryptToken } from '@/crypto/token-cipher';
import { refreshAccessToken, type RefreshParams, type RefreshResult } from '@/naver/oauth';

type DB = PostgresJsDatabase<typeof schema>;
type NaverTokenRow = typeof naverTokens.$inferSelect;

export class NaverTokenError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly raw?: unknown
  ) {
    super(message);
    this.name = 'NaverTokenError';
  }
}

/** 단일 토큰 행(없으면 null). */
export async function getTokenRow(db: DB): Promise<NaverTokenRow | null> {
  const [row] = await db.select().from(naverTokens).limit(1);
  return row ?? null;
}

/** refresh token 을 암호화해 저장(초기 셋업/재발급). 기존 행 있으면 갱신, 없으면 삽입. */
export async function storeRefreshToken(db: DB, plaintext: string, key: Buffer): Promise<void> {
  const encrypted = encryptToken(plaintext, key);
  const existing = await getTokenRow(db);
  if (existing) {
    await db
      .update(naverTokens)
      .set({ refreshTokenEncrypted: encrypted, status: 'ok' })
      .where(eq(naverTokens.id, existing.id));
  } else {
    await db.insert(naverTokens).values({ refreshTokenEncrypted: encrypted, status: 'ok' });
  }
}

export interface RefreshDeps {
  key: Buffer;
  clientId: string;
  clientSecret: string;
  /** 테스트용 주입(기본: 실제 네이버 호출). */
  refresh?: (p: RefreshParams) => Promise<RefreshResult>;
}

export interface AccessToken {
  accessToken: string;
  expiresIn?: number;
}

/**
 * 저장된 refresh token 으로 access token 을 갱신한다.
 *  - 성공: last_refreshed_at=now, status='ok'. 네이버가 refresh token 을 재발급하면 재암호화 저장.
 *  - 실패: status='error' 로 표시하고 NaverTokenError 를 던진다.
 */
export async function refreshAndStore(db: DB, deps: RefreshDeps): Promise<AccessToken> {
  const row = await getTokenRow(db);
  if (!row) throw new NaverTokenError('저장된 naver refresh token 이 없습니다.', 0);

  const refreshToken = decryptToken(row.refreshTokenEncrypted, deps.key);
  const doRefresh = deps.refresh ?? refreshAccessToken;
  const result = await doRefresh({
    clientId: deps.clientId,
    clientSecret: deps.clientSecret,
    refreshToken,
  });

  if (!result.ok || !result.accessToken) {
    await db.update(naverTokens).set({ status: 'error' }).where(eq(naverTokens.id, row.id));
    throw new NaverTokenError(`네이버 토큰 갱신 실패 (status ${result.status})`, result.status, result.raw);
  }

  // 네이버가 refresh token 을 재발급했으면 재암호화해 교체.
  const patch: Partial<NaverTokenRow> = { lastRefreshedAt: new Date(), status: 'ok' };
  if (result.refreshToken && result.refreshToken !== refreshToken) {
    patch.refreshTokenEncrypted = encryptToken(result.refreshToken, deps.key);
  }
  await db.update(naverTokens).set(patch).where(eq(naverTokens.id, row.id));

  return { accessToken: result.accessToken, expiresIn: result.expiresIn };
}
