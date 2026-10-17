import { describe, it, expect } from 'vitest';
import { looksLikePdf } from './guidebooks';

const enc = (s: string) => new TextEncoder().encode(s);

describe('looksLikePdf — 올린 쪽이 붙인 형식이 아니라 내용으로 본다', () => {
  it('PDF 서명이 맨 앞에 있으면 PDF 다', () => {
    expect(looksLikePdf(enc('%PDF-1.7\n%âãÏÓ\n1 0 obj'))).toBe(true);
  });

  it('서명 앞에 잡음이 조금 있어도 첫 1KB 안이면 받는다(명세가 허용한다)', () => {
    expect(looksLikePdf(enc(`${'\n'.repeat(20)}%PDF-1.4`))).toBe(true);
  });

  it('PDF 라고 우기는 다른 파일은 거부한다', () => {
    expect(looksLikePdf(enc('<!doctype html><script>alert(1)</script>'))).toBe(false);
    expect(looksLikePdf(enc('%PD'))).toBe(false); // 잘린 서명
    expect(looksLikePdf(new Uint8Array())).toBe(false);
  });
});
