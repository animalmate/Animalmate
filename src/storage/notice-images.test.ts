import { describe, it, expect } from 'vitest';
import { sniffImageType, storagePathFromUrl } from './notice-images';

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

describe('sniffImageType — 내용으로 형식을 판정', () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);

  it('PNG·JPEG·WebP 서명을 알아본다', () => {
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe('image/webp');
  });

  it('이미지라고 우기는 다른 파일은 거부한다(공개 버킷이 파일 보관소가 되지 않게)', () => {
    expect(sniffImageType(new TextEncoder().encode('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20))).toBeNull(); // RIFF....AVI
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});
