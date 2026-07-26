// 카페 글쓰기(POST) — 유일하게 허용된 카페 API(쓰기 전용). Phase 0 scripts/lib/naver.mjs 의 TS 포트.
//
// ⚠ 실카페 호출은 **dryRun 플래그 뒤**에 있다(기본 dryRun=true). step 4(발행 워커) 준비 신호 전까지
//   실제 게시가 일어나지 않도록, dryRun 을 명시적으로 false 로 줄 때만 네이버로 POST 한다.
//   삭제 API 가 없으므로(실수 게시 = 수동 삭제) 이 게이트는 안전장치다.

const OPENAPI_BASE = 'https://openapi.naver.com/v1/cafe';

export interface CafeImage {
  filename: string;
  bytes: Uint8Array;
  contentType: string;
}

export interface CafeWriteParams {
  accessToken: string;
  clubId: string;
  menuId: string | number;
  subject: string;
  content: string;
  images?: CafeImage[];
}

export interface CafeWriteResult {
  ok: boolean;
  status: number;
  articleUrl?: string;
  raw: unknown;
  dryRun?: boolean;
}

export interface CafeWriteOptions {
  /** 기본 true(안전). false 를 명시할 때만 실제 카페로 게시한다. */
  dryRun?: boolean;
}

/** HTML 특수문자 이스케이프 (사용자가 입력한 태그가 HTML로 실행되지 않도록 이스케이프) */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 카페 본문 포맷팅:
 * (a) HTML 특수문자 이스케이프 → (b) 개행을 <br>로 변환하는 순서로 처리.
 * 순서가 바뀌면 <br> 태그가 이스케이프되어 화면에 그대로 노출된다.
 * 연속 개행(빈 줄)도 개수만큼 보존한다.
 */
export function formatContentForCafe(content: string): string {
  const escaped = escapeHtml(content);
  return escaped.replace(/\r?\n/g, '<br>');
}

/** 카페에 글을 게시한다. dryRun(기본 true)이면 네트워크 호출 없이 시뮬레이션 결과를 반환. */
export async function postArticle(
  params: CafeWriteParams,
  options: CafeWriteOptions = {}
): Promise<CafeWriteResult> {
  const dryRun = options.dryRun ?? true;
  if (dryRun) {
    return {
      ok: true,
      status: 200,
      articleUrl: `dry-run://cafe/${params.clubId}/${params.menuId}`,
      raw: { dryRun: true, subject: params.subject, content: formatContentForCafe(params.content) },
      dryRun: true,
    };
  }

  const formattedContent = formatContentForCafe(params.content);
  const url = `${OPENAPI_BASE}/${params.clubId}/menu/${params.menuId}/articles`;
  const headers: Record<string, string> = { Authorization: `Bearer ${params.accessToken}` };

  let res: Response;
  if (params.images && params.images.length > 0) {
    const form = new FormData();
    form.set('subject', encodeURIComponent(params.subject));
    form.set('content', encodeURIComponent(formattedContent));
    for (const img of params.images) {
      // Node 의 Uint8Array<ArrayBufferLike> 를 BlobPart 로 취급(런타임 정상, 타입만 캐스트).
      form.append('image', new Blob([img.bytes as unknown as BlobPart], { type: img.contentType }), img.filename);
    }
    res = await fetch(url, { method: 'POST', headers, body: form });
  } else {
    const body = new URLSearchParams();
    body.set('subject', encodeURIComponent(params.subject));
    body.set('content', encodeURIComponent(formattedContent));
    res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  }

  let raw: Record<string, unknown> = {};
  try {
    raw = (await res.json()) as Record<string, unknown>;
  } catch {
    raw = {};
  }
  const message = raw.message as Record<string, unknown> | undefined;
  const result = (message?.result ?? raw.result) as Record<string, unknown> | undefined;
  const articleUrl = result?.articleUrl as string | undefined;
  return { ok: res.ok, status: res.status, articleUrl, raw };
}
