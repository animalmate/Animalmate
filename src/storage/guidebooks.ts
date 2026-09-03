import 'server-only'; // service role 키를 다루므로 클라이언트 번들에 들어가면 안 된다.

// 팀 가이드북 PDF 를 Supabase Storage 에 둔다.
//
// **비공개 버킷이다**(모집 포스터와 다르다). 포스터는 지원자 누구나 봐야 해서 public 이지만,
// 가이드북은 로그인한 회원에게만 보일 자료다. public 버킷이면 주소를 아는 사람은 누구나 받는다
// — 주소는 공유되고 새어 나가므로 "안 알려주면 된다"는 방어가 아니다.
// 그래서 읽을 때마다 **짧게 사는 서명 URL** 을 서버가 발급한다.
//
// 업로드는 브라우저가 Storage 로 **직접** 보낸다(서명 업로드 URL). API Route 로 받지 않는 이유:
// Vercel 서버리스 함수의 요청 본문 상한이 4.5MB 라, 10MB 짜리 가이드북은 우리 코드에
// 닿기도 전에 413 으로 끊긴다. 파일은 Storage 로 바로 가고 서버는 경로만 받는다.
//
// @supabase/supabase-js 를 넣지 않고 Storage REST 를 직접 호출한다 — notice-images.ts 와 같은 방침.

export const GUIDEBOOK_BUCKET = 'team-guidebooks';

/** PDF 만 받는다. PPTX 는 브라우저가 못 여니 "바로 보기" 요구를 못 지킨다(파워포인트에서 PDF 로 저장). */
export const ALLOWED_GUIDEBOOK_TYPE = 'application/pdf';
/**
 * 파일 크기 상한 50MB.
 *
 * 이 숫자는 고른 것이 아니라 **천장 두 개가 겹치는 자리**다(2026-09-03 실측):
 *   ① Supabase 무료 플랜의 파일당 상한 = 50MB. 49MB 는 200, 55MB 는 413 `EntityTooLarge` 로
 *      잘린다 — 서명 URL 로 직접 올리므로 이 거부는 **우리 코드에 닿기도 전에** 일어난다.
 *   ② Gemini 의 PDF 상한 = 50MB(1000쪽). 넘으면 파일은 올라가는데 추출만 실패한다.
 * 유료로 올려도 ②는 그대로라 50MB 가 끝이다. 그 이상은 받을 방법이 없다.
 *
 * 옛 값 20MB 는 "Gemini inlineData 요청 본문 한도 20MB"를 근거로 삼았는데, 그 한도는
 * 2026-01-12 에 100MB 로 올랐고 추출도 Files API 로 옮겨(`src/rag/gemini.ts`) 근거가 사라졌다.
 */
export const MAX_GUIDEBOOK_BYTES = 50 * 1024 * 1024;

/** 보기용 서명 URL 유효기간(초). 화면을 열어 둔 채 읽을 만큼만 준다. */
const VIEW_URL_TTL_SEC = 60 * 30;

function storageBase(): { base: string; key: string } {
  const base = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!base || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다(서버 환경변수).');
  }
  return { base, key };
}

const authHeaders = (key: string) => ({ apikey: key, Authorization: `Bearer ${key}` });

/**
 * 팀 가이드북이 놓일 버킷 내부 경로. 파일명은 **사용자 입력을 쓰지 않는다**
 * (경로 조작·한글 파일명 문제 회피). 원본 파일명은 DB 의 file_name 에 따로 둔다.
 *
 * 경로에 난수를 넣는 이유: 팀당 한 건이지만 교체할 때 같은 경로에 덮어쓰면 브라우저·CDN 이
 * 옛 파일을 캐시로 계속 보여 준다. 새 경로를 쓰고 옛 파일은 지운다.
 */
export function guidebookPath(teamId: string): string {
  return `${teamId}/${crypto.randomUUID()}.pdf`;
}

/**
 * 동아리 전체 가이드북이 놓일 경로. 팀 경로가 UUID 로 시작하므로 `club/` 과 절대 겹치지 않는다
 * (팀 하나를 통째로 가리키는 접두사가 아니라 예약어다).
 */
export const CLUB_GUIDEBOOK_PREFIX = 'club';
export function clubGuidebookPath(): string {
  return `${CLUB_GUIDEBOOK_PREFIX}/${crypto.randomUUID()}.pdf`;
}

export interface SignedUpload {
  /** 브라우저가 PUT 할 절대 주소. */
  uploadUrl: string;
  path: string;
}

/**
 * 브라우저가 파일을 직접 올릴 수 있는 **일회성 서명 URL**. 서비스 키는 서버에만 남는다.
 *
 * 서명은 이 경로 하나에만 유효하므로, 브라우저가 받은 URL 로 다른 팀 경로나 다른 버킷에
 * 쓸 수 없다. 경로를 정하는 것은 항상 서버다(요청 본문의 경로를 믿지 않는다).
 */
export async function createGuidebookUploadUrl(path: string): Promise<SignedUpload> {
  const { base, key } = storageBase();

  const res = await fetch(`${base}/storage/v1/object/upload/sign/${GUIDEBOOK_BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...authHeaders(key), 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`서명 업로드 URL 발급 실패: ${res.status} ${await res.text()}`);

  const body = (await res.json()) as { url?: string };
  if (!body.url) throw new Error('서명 업로드 URL 응답에 url 이 없습니다.');
  // 응답의 url 은 `/object/upload/sign/...` 처럼 상대 경로라 앞에 호스트를 붙인다.
  return { uploadUrl: `${base}/storage/v1${body.url}`, path };
}

/**
 * 보기용 서명 URL. 만료가 있으므로 화면을 열 때마다 새로 발급한다(DB 에 저장하지 않는다).
 * 저장해 두면 만료된 주소가 화면에 남아 "가이드북이 안 열린다"가 된다.
 */
export async function createGuidebookViewUrl(path: string): Promise<string> {
  const { base, key } = storageBase();
  const res = await fetch(`${base}/storage/v1/object/sign/${GUIDEBOOK_BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...authHeaders(key), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: VIEW_URL_TTL_SEC }),
  });
  if (!res.ok) throw new Error(`서명 보기 URL 발급 실패: ${res.status} ${await res.text()}`);

  const body = (await res.json()) as { signedURL?: string; signedUrl?: string };
  const signed = body.signedURL ?? body.signedUrl;
  if (!signed) throw new Error('서명 보기 URL 응답에 signedURL 이 없습니다.');
  return `${base}/storage/v1${signed}`;
}

/**
 * 서버가 파일 원본을 받아 온다(텍스트 추출용). 서비스 키로 직접 읽으므로 서명이 필요 없다.
 *
 * 이 경로는 **요청 본문이 아니라 응답**이라 Vercel 의 4.5MB 본문 상한과 무관하다.
 * 다만 함수 메모리에 통째로 올라가므로 상한(MAX_GUIDEBOOK_BYTES)을 넘겨 부르지 않는다.
 */
export async function downloadGuidebook(path: string): Promise<ArrayBuffer> {
  const { base, key } = storageBase();
  const res = await fetch(`${base}/storage/v1/object/${GUIDEBOOK_BUCKET}/${path}`, {
    headers: authHeaders(key),
  });
  if (!res.ok) throw new Error(`가이드북 내려받기 실패: ${res.status}`);
  return res.arrayBuffer();
}

/**
 * 파일이 실제로 올라와 있는지와 크기를 확인한다.
 *
 * 왜 필요한가: 업로드는 브라우저가 Storage 로 직접 하므로 **서버는 그 과정을 보지 못한다.**
 * 브라우저가 "다 올렸어요"라고만 말하고 실제로는 안 올렸을 수도, 상한을 넘겼을 수도 있다.
 * 서버가 스스로 확인하지 않으면 클라이언트 말을 그대로 믿는 셈이 된다.
 */
export async function headGuidebook(path: string): Promise<{ ok: boolean; bytes: number; contentType: string }> {
  const { base, key } = storageBase();
  // HEAD 는 일부 게이트웨이에서 헤더가 비어 오므로 Range 로 1바이트만 받아 확인한다.
  const res = await fetch(`${base}/storage/v1/object/${GUIDEBOOK_BUCKET}/${path}`, {
    method: 'GET',
    headers: { ...authHeaders(key), Range: 'bytes=0-0' },
  });
  if (!res.ok) return { ok: false, bytes: 0, contentType: '' };

  const contentType = res.headers.get('content-type') ?? '';
  // 206 이면 Content-Range: bytes 0-0/12345 의 마지막 값이 전체 크기다.
  const range = res.headers.get('content-range') ?? '';
  const total = Number(range.split('/')[1] ?? res.headers.get('content-length') ?? 0);
  return { ok: true, bytes: Number.isFinite(total) ? total : 0, contentType };
}

/**
 * 가이드북 파일 삭제. 교체·삭제 시 옛 파일이 스토리지에 남지 않게 한다.
 * 실패해도 예외를 던지지 않는다 — 이미 지워진 파일 때문에 DB 정리가 막히면 안 된다.
 */
export async function deleteGuidebook(path: string): Promise<boolean> {
  try {
    const { base, key } = storageBase();
    const res = await fetch(`${base}/storage/v1/object/${GUIDEBOOK_BUCKET}/${path}`, {
      method: 'DELETE',
      headers: authHeaders(key),
    });
    return res.ok;
  } catch {
    return false;
  }
}
