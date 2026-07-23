// 네이버 OAuth — refresh token → access token 갱신(네트워크). Phase 0 scripts/lib/naver.mjs 의 TS 포트.
// 카페 API 는 쓰기 전용(글쓰기 POST)뿐 — 읽기/수정/삭제 없음(CLAUDE.md 규칙).

const TOKEN_URL = 'https://nid.naver.com/oauth2.0/token';

export interface RefreshResult {
  ok: boolean;
  status: number;
  accessToken?: string;
  /** 네이버가 갱신 시 refresh token 을 재발급할 수도, 안 할 수도 있다. */
  refreshToken?: string;
  expiresIn?: number;
  raw: unknown;
}

export interface RefreshParams {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/** refresh token 으로 access token 을 갱신한다. */
export async function refreshAccessToken(p: RefreshParams): Promise<RefreshResult> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: p.clientId,
    client_secret: p.clientSecret,
    refresh_token: p.refreshToken,
  });
  const res = await fetch(`${TOKEN_URL}?${params.toString()}`, { method: 'GET' });
  let raw: Record<string, unknown> = {};
  try {
    raw = (await res.json()) as Record<string, unknown>;
  } catch {
    raw = {};
  }
  return {
    ok: res.ok && !raw.error,
    status: res.status,
    accessToken: raw.access_token as string | undefined,
    refreshToken: raw.refresh_token as string | undefined,
    expiresIn: raw.expires_in ? Number(raw.expires_in) : undefined,
    raw,
  };
}
