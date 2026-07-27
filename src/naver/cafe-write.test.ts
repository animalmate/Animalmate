import { describe, it, expect } from 'vitest';
import { escapeHtml, formatContentForCafe } from './cafe-write';

describe('Naver Cafe Content Formatting & HTML Escaping', () => {
  it('escapes HTML special characters correctly', () => {
    const raw = '1 < 2 & 3 > 0 "quote" \'single\'';
    const escaped = escapeHtml(raw);
    expect(escaped).toBe('1 &lt; 2 &amp; 3 &gt; 0 &quot;quote&quot; &#39;single&#39;');
  });

  it('formats single line text without changing lines', () => {
    const input = '안녕하세요 애니멀메이트입니다.';
    expect(formatContentForCafe(input)).toBe('안녕하세요 애니멀메이트입니다.');
  });

  it('converts single newline to <br>', () => {
    const input = '첫번째 줄\n두번째 줄';
    expect(formatContentForCafe(input)).toBe('첫번째 줄<br>두번째 줄');
  });

  it('preserves consecutive empty lines (1 empty line = 2 newlines)', () => {
    const input = '제목\n\n본문 내용';
    expect(formatContentForCafe(input)).toBe('제목<br><br>본문 내용');
  });

  it('preserves multiple consecutive empty lines (3 empty lines = 4 newlines)', () => {
    const input = '첫번째 줄\n\n\n\n네번째 줄';
    expect(formatContentForCafe(input)).toBe('첫번째 줄<br><br><br><br>네번째 줄');
  });

  it('escapes HTML tags before converting newlines to <br> so tags are not executed', () => {
    const input = '<b>공지사항</b>\n<script>alert(1)</script> & <test>';
    const formatted = formatContentForCafe(input);

    // 태그가 이스케이프되고, <br> 은 이스케이프되지 않은 채로 치환되었는지 검증
    expect(formatted).toBe(
      '&lt;b&gt;공지사항&lt;/b&gt;<br>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;test&gt;'
    );
  });

  it('handles Windows CRLF newlines correctly', () => {
    const input = '줄1\r\n\r\n줄2';
    expect(formatContentForCafe(input)).toBe('줄1<br><br>줄2');
  });
});
