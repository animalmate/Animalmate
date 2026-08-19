import { describe, it, expect } from 'vitest';
import { decodeCsvBytes, MAX_CSV_BYTES } from './csv-file';

const bytes = (...parts: (number[] | Uint8Array)[]): ArrayBuffer => {
  const flat: number[] = [];
  for (const p of parts) flat.push(...Array.from(p));
  return new Uint8Array(flat).buffer;
};
const utf8 = (s: string): ArrayBuffer => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe('업로드 파일 읽기', () => {
  it('구글 폼이 주는 UTF-8 CSV(BOM 포함)를 그대로 읽는다', () => {
    const res = decodeCsvBytes(utf8('﻿이름,전화번호\n김서준,01012345678'));
    expect(res).toMatchObject({ ok: true, encoding: 'utf-8' });
    expect(res.ok && res.text).toContain('김서준');
  });

  // 구글 스프레드시트 다운로드 메뉴에서 가장 흔한 실수. 예전에는 zip 바이너리를 글자로 읽어
  // 머리글이 "PK♥♦…" 가 되고, 화면은 "이름·전화번호를 연결하세요"라고만 말했다.
  it('.xlsx(zip) 를 올리면 CSV 로 다시 받으라고 알려 준다', () => {
    const res = decodeCsvBytes(bytes([0x50, 0x4b, 0x03, 0x04], [0x14, 0x00, 0x00, 0x00]));
    expect(res.ok).toBe(false);
    expect(!res.ok && res.message).toContain('엑셀 파일(.xlsx)');
  });

  it('옛 엑셀(.xls)도 막는다', () => {
    const res = decodeCsvBytes(bytes([0xd0, 0xcf, 0x11, 0xe0], [0xa1, 0xb1, 0x1a, 0xe1]));
    expect(res.ok).toBe(false);
    expect(!res.ok && res.message).toContain('.xls');
  });

  // 엑셀로 열었다가 저장하면 CP949 가 된다. 막기만 하면 사람이 손으로 열을 연결해
  // **깨진 글자를 지원자 이름으로 저장**해 버리므로, 되살릴 수 있으면 되살린다.
  it('엑셀이 저장한 CP949 CSV 는 인코딩을 되살려 읽는다', () => {
    // "이름,전화번호\n김서준,01012345678" 의 CP949 바이트열.
    const cp949 = [
      0xc0, 0xcc, 0xb8, 0xa7, 0x2c, 0xc0, 0xfc, 0xc8, 0xad, 0xb9, 0xf8, 0xc8, 0xa3, 0x0a, 0xb1,
      0xe8, 0xbc, 0xad, 0xc1, 0xd8, 0x2c, 0x30, 0x31, 0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36,
      0x37, 0x38,
    ];
    const res = decodeCsvBytes(bytes(cp949));
    expect(res).toMatchObject({ ok: true, encoding: 'cp949' });
    expect(res.ok && res.text).toBe('이름,전화번호\n김서준,01012345678');
  });

  it('텍스트가 아닌 파일과 빈 파일을 막는다', () => {
    expect(decodeCsvBytes(bytes([0x00, 0x01, 0x02, 0x03])).ok).toBe(false);
    expect(decodeCsvBytes(bytes([])).ok).toBe(false);
  });

  // 배포 환경의 요청 본문 상한(4.5MB)에 걸리면 업로드 요청이 서버에 닿지도 못한다.
  it('본문 상한을 넘는 파일은 미리 막는다', () => {
    const big = new Uint8Array(MAX_CSV_BYTES + 1).fill(0x41);
    const res = decodeCsvBytes(big.buffer as ArrayBuffer);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.message).toContain('너무 큽니다');
  });
});
