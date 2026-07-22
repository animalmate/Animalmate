// 네이버 카페 OpenAPI 공용 헬퍼 (Phase 0 검증 전용, 무의존성 Node ESM).
//
// 00 규칙: 카페 API는 "글쓰기(POST)"만 존재. 읽기/수정/삭제/댓글 없음.
//   POST https://openapi.naver.com/v1/cafe/{clubid}/menu/{menuid}/articles
//   - subject, content 는 UTF-8 URL 인코딩
//   - 이미지는 multipart/form-data, 여러 장은 image 파라미터 반복
// 토큰 갱신: https://nid.naver.com/oauth2.0/token (grant_type=refresh_token)

const OPENAPI_BASE = 'https://openapi.naver.com/v1/cafe';
const TOKEN_URL = 'https://nid.naver.com/oauth2.0/token';

/**
 * 필수 환경 변수를 읽고, 없으면 명확한 에러로 중단한다.
 * @param {string[]} names
 * @returns {Record<string,string>}
 */
export function requireEnv(names) {
  const out = {};
  const missing = [];
  for (const n of names) {
    const v = process.env[n];
    if (!v || v.trim() === '') missing.push(n);
    else out[n] = v.trim();
  }
  if (missing.length) {
    throw new Error(
      `환경 변수 누락: ${missing.join(', ')}\n` +
        `  .env 파일에 값을 채운 뒤 다시 실행하세요 (env.example 참고).`
    );
  }
  return out;
}

/**
 * 카페에 텍스트 글을 게시한다 (application/x-www-form-urlencoded).
 * @param {object} p
 * @param {string} p.accessToken
 * @param {string} p.clubId
 * @param {string} p.menuId
 * @param {string} p.subject
 * @param {string} p.content
 * @returns {Promise<{ok: boolean, status: number, articleUrl?: string, raw: any}>}
 */
export async function postArticleText({ accessToken, clubId, menuId, subject, content }) {
  const url = `${OPENAPI_BASE}/${clubId}/menu/${menuId}/articles`;
  // 네이버 스펙: subject/content 는 URL 인코딩된 값이어야 한다.
  const body = new URLSearchParams();
  body.set('subject', encodeURIComponent(subject));
  body.set('content', encodeURIComponent(content));

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  return parseArticleResponse(res);
}

/**
 * 카페에 이미지 포함 글을 게시한다 (multipart/form-data).
 * @param {object} p
 * @param {string} p.accessToken
 * @param {string} p.clubId
 * @param {string} p.menuId
 * @param {string} p.subject
 * @param {string} p.content
 * @param {{ filename: string, bytes: Uint8Array, contentType: string }[]} p.images
 * @returns {Promise<{ok: boolean, status: number, articleUrl?: string, raw: any}>}
 */
export async function postArticleWithImages({ accessToken, clubId, menuId, subject, content, images }) {
  const url = `${OPENAPI_BASE}/${clubId}/menu/${menuId}/articles`;
  const form = new FormData();
  form.set('subject', encodeURIComponent(subject));
  form.set('content', encodeURIComponent(content));
  // 여러 장은 동일 파라미터명(image)으로 반복 append.
  for (const img of images) {
    form.append('image', new Blob([img.bytes], { type: img.contentType }), img.filename);
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` }, // multipart 경계는 fetch가 자동 설정
    body: form,
  });
  return parseArticleResponse(res);
}

/**
 * refresh token 으로 access token 을 갱신한다.
 * @param {object} p
 * @param {string} p.clientId
 * @param {string} p.clientSecret
 * @param {string} p.refreshToken
 * @returns {Promise<{ok: boolean, status: number, accessToken?: string, refreshToken?: string, expiresIn?: number, raw: any}>}
 */
export async function refreshAccessToken({ clientId, clientSecret, refreshToken }) {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  const res = await fetch(`${TOKEN_URL}?${params.toString()}`, { method: 'GET' });
  const raw = await safeJson(res);
  return {
    ok: res.ok && !raw?.error,
    status: res.status,
    accessToken: raw?.access_token,
    // 네이버는 갱신 시 refresh_token 을 재발급할 수도, 안 할 수도 있다.
    refreshToken: raw?.refresh_token,
    expiresIn: raw?.expires_in ? Number(raw.expires_in) : undefined,
    raw,
  };
}

async function parseArticleResponse(res) {
  const raw = await safeJson(res);
  // 성공 응답 예: { message: {...}, result: { articleId, articleUrl } }
  const articleUrl = raw?.message?.result?.articleUrl ?? raw?.result?.articleUrl;
  return { ok: res.ok, status: res.status, articleUrl, raw };
}

async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _nonJson: text };
  }
}
