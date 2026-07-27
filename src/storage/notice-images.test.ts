import { describe, it, expect } from 'vitest';
import { storagePathFromUrl } from './notice-images';

const BASE = 'https://example.supabase.co';
const ok = `${BASE}/storage/v1/object/public/recruit-notice/`;

describe('공고 이미지 URL → 스토리지 경로', () => {
  it('우리 버킷 URL 에서 경로를 뽑는다', () => {
    expect(storagePathFromUrl(`${ok}abc-123/de-f.jpg`, BASE)).toBe('abc-123/de-f.jpg');
  });

  it('쿼리스트링·해시는 떼어낸다', () => {
    expect(storagePathFromUrl(`${ok}a/b.png?v=2`, BASE)).toBe('a/b.png');
  });

  it('경로 조작(..)을 막는다', () => {
    // 접두사만 확인하면 통과해서 버킷 밖 객체를 지울 수 있다.
    expect(storagePathFromUrl(`${ok}../../other/file.png`, BASE)).toBeNull();
    expect(storagePathFromUrl(`${ok}a/../../b.png`, BASE)).toBeNull();
    expect(storagePathFromUrl(`${ok}/etc/passwd`, BASE)).toBeNull();
  });

  it('다른 버킷·다른 호스트·빈 경로를 막는다', () => {
    expect(storagePathFromUrl(`${BASE}/storage/v1/object/public/other-bucket/a.png`, BASE)).toBeNull();
    expect(storagePathFromUrl('https://evil.example/x.png', BASE)).toBeNull();
    expect(storagePathFromUrl(ok, BASE)).toBeNull();
    expect(storagePathFromUrl(`${ok}a.png`, '')).toBeNull();
  });

  it('예상 밖 문자가 든 경로를 막는다', () => {
    expect(storagePathFromUrl(`${ok}a b.png`, BASE)).toBeNull();
    expect(storagePathFromUrl(`${ok}한글.png`, BASE)).toBeNull();
  });
});
