import 'server-only'; // service role 키를 다루므로 클라이언트 번들에 들어가면 안 된다.

// 모집 공고 포스터 이미지를 Supabase Storage 에 올린다.
//
// 왜 DB 가 아니라 Storage 인가:
//   예전에는 브라우저에서 canvas.toDataURL() 로 만든 base64 문자열을 그대로
//   recruit_cohorts.notice_images(jsonb)에 넣었다. base64 는 원본보다 약 33% 크고,
//   포스터 몇 장이면 행 하나가 수 MB가 된다. 그 행은 공고를 읽을 때마다, 공고 설정 화면을
//   열 때마다 통째로 오간다(무료 티어 용량·전송량 모두 부담). 이제 URL 만 저장한다.
//
// @supabase/supabase-js 를 새로 넣지 않고 Storage REST 를 직접 호출한다 —
// 이 프로젝트는 supabase 클라이언트 의존성이 없고, 필요한 건 업로드·삭제 두 가지뿐이다.

export const NOTICE_BUCKET = 'recruit-notice';

/** 허용 이미지 형식. 버킷 쪽에도 같은 제한이 걸려 있다(이중 방어). */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function storageBase(): { base: string; key: string } {
  const base = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!base || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다(서버 환경변수).');
  }
  return { base, key };
}

/** 공개 읽기 URL. 버킷이 public 이라 서명이 필요 없다(공고 포스터는 누구나 봐야 한다). */
export function publicUrlFor(path: string): string {
  const { base } = storageBase();
  return `${base}/storage/v1/object/public/${NOTICE_BUCKET}/${path}`;
}

/** 우리 버킷이 발급한 URL 인지 — 임의 외부 URL 이 공고에 섞여 들어오는 것을 막는다. */
export function isOwnStorageUrl(url: string): boolean {
  try {
    const base = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
    if (!base) return false;
    return url.startsWith(`${base}/storage/v1/object/public/${NOTICE_BUCKET}/`);
  } catch {
    return false;
  }
}

export interface UploadedImage {
  url: string;
  path: string;
}

/**
 * 이미지 1장 업로드. 경로는 `{cohortId}/{난수}.{확장자}` 로, 파일명은 사용자 입력을 쓰지 않는다
 * (경로 조작·한글 파일명 문제 회피).
 */
export async function uploadNoticeImage(
  cohortId: string,
  bytes: ArrayBuffer,
  contentType: string
): Promise<UploadedImage> {
  const { base, key } = storageBase();

  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${cohortId}/${crypto.randomUUID()}.${ext}`;

  const res = await fetch(`${base}/storage/v1/object/${NOTICE_BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': contentType,
      'cache-control': 'public, max-age=31536000, immutable', // 경로에 난수가 있어 내용이 바뀌지 않는다
    },
    body: bytes,
  });

  if (!res.ok) {
    throw new Error(`storage upload failed: ${res.status} ${await res.text()}`);
  }
  return { url: publicUrlFor(path), path };
}

/**
 * 이미지 삭제. 공고에서 뺀 이미지가 스토리지에 계속 남지 않게 한다.
 * 실패해도 예외를 던지지 않는다 — 화면에서 이미 제거된 이미지 때문에 저장이 막히면 안 된다.
 */
export async function deleteNoticeImageByUrl(url: string): Promise<boolean> {
  if (!isOwnStorageUrl(url)) return false;
  try {
    const { base, key } = storageBase();
    const path = url.split(`/object/public/${NOTICE_BUCKET}/`)[1];
    if (!path) return false;
    const res = await fetch(`${base}/storage/v1/object/${NOTICE_BUCKET}/${path}`, {
      method: 'DELETE',
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
