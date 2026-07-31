import { describe, it, expect } from 'vitest';
import { normalizeLinkUrl, InvalidLinkError, MAX_LINK_LENGTH } from './links';

describe('normalizeLinkUrl', () => {
  it('정상적인 구글 드라이브 주소를 받는다', () => {
    const u = 'https://drive.google.com/drive/folders/1AbC-dEf_gH';
    expect(normalizeLinkUrl(u)).toBe(u);
  });

  it('앞뒤 공백은 다듬는다', () => {
    expect(normalizeLinkUrl('  https://drive.google.com/x  ')).toBe('https://drive.google.com/x');
  });

  it('비우면 null — "이번 기수엔 드라이브 없음"은 정상 상태다', () => {
    expect(normalizeLinkUrl('')).toBeNull();
    expect(normalizeLinkUrl('   ')).toBeNull();
    expect(normalizeLinkUrl(null)).toBeNull();
    expect(normalizeLinkUrl(undefined)).toBeNull();
  });

  // ── 여기부터가 보안 검사 ────────────────────────────────────────────
  // 이 값은 화면에서 <a href> 로 그대로 나간다. 스킴을 안 막으면 링크를 누른 사람의
  // 브라우저에서 코드가 실행된다(XSS). 회장단 전용 입력이어도 서버에서 막는다(규칙 #6).
  it('javascript: 스킴을 막는다 — 누르면 코드가 실행되는 주소다', () => {
    expect(() => normalizeLinkUrl('javascript:alert(1)')).toThrow(InvalidLinkError);
    expect(() => normalizeLinkUrl('JavaScript:alert(1)')).toThrow(InvalidLinkError);
    expect(() => normalizeLinkUrl('  javascript:alert(document.cookie)  ')).toThrow(InvalidLinkError);
  });

  it('data:·file:·http: 도 막는다 — https 만 허용한다', () => {
    for (const bad of ['data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', 'http://drive.google.com/x']) {
      expect(() => normalizeLinkUrl(bad), bad).toThrow(InvalidLinkError);
    }
  });

  it('주소 형태가 아니면 막는다', () => {
    for (const bad of ['그냥 글자', 'drive.google.com/x', '//drive.google.com/x']) {
      expect(() => normalizeLinkUrl(bad), bad).toThrow(InvalidLinkError);
    }
  });

  it('너무 긴 주소를 막는다(무료 티어 용량·화면 깨짐 방지)', () => {
    expect(() => normalizeLinkUrl('https://drive.google.com/' + 'a'.repeat(MAX_LINK_LENGTH))).toThrow(InvalidLinkError);
  });

  it('거부 사유를 사람 말로 알려 준다', () => {
    try {
      normalizeLinkUrl('javascript:alert(1)');
      expect.unreachable('막혔어야 한다');
    } catch (e) {
      expect((e as InvalidLinkError).message).toContain('https://');
    }
  });
});
