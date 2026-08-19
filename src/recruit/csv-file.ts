// 업로드 화면이 연 **파일**을 글자로 바꾸는 단계(순수 — DOM·네트워크를 쓰지 않는다).
//
// 왜 File.text() 를 그냥 쓰지 않는가: 그 함수는 무엇을 받았든 UTF-8 로 읽는다. 그래서
//  · 구글 스프레드시트에서 실수로 **.xlsx** 로 받아 올리면 zip 바이너리가 글자로 읽혀
//    머리글이 "PK♥♦…" 가 되고, 화면은 엉뚱하게 "이름·전화번호를 연결하세요"라고만 말했다.
//  · CSV 를 엑셀로 열었다가 저장하면 **CP949(EUC-KR)** 가 되는데, 이걸 UTF-8 로 읽으면
//    "이름" 이 "�̸�" 이 된다. 이때 사람이 손으로 열을 연결해 버리면 **깨진 글자가 그대로
//    지원자 이름으로 저장된다** — 막는 것보다 나쁜 결과다.
// 둘 다 "왜 안 되는지"를 말해 주고, 되살릴 수 있는 쪽(CP949)은 되살린다.

/** 파일을 읽은 결과. 실패하면 화면에 그대로 보여 줄 이유(message)를 담는다. */
export type CsvDecodeResult =
  | { ok: true; text: string; encoding: 'utf-8' | 'cp949' }
  | { ok: false; message: string };

/** 이 크기를 넘으면 업로드 요청 자체가 서버에 닿지 못한다(배포 환경 본문 상한 4.5MB). */
export const MAX_CSV_BYTES = 4 * 1024 * 1024;

const startsWith = (bytes: Uint8Array, sig: number[]): boolean =>
  sig.every((b, i) => bytes[i] === b);

function decode(bytes: Uint8Array, label: string, fatal: boolean): string | null {
  try {
    return new TextDecoder(label, { fatal }).decode(bytes);
  } catch {
    return null; // 깨진 바이트열이거나, 그 인코딩을 모르는 환경
  }
}

/**
 * 업로드된 파일의 바이트열을 CSV 텍스트로 바꾼다.
 *
 * 순서: 못 쓰는 형식인지(zip/바이너리) → UTF-8 → CP949.
 */
export function decodeCsvBytes(buffer: ArrayBuffer): CsvDecodeResult {
  const bytes = new Uint8Array(buffer);

  if (bytes.length === 0) {
    return { ok: false, message: '파일이 비어 있습니다.' };
  }
  if (bytes.length > MAX_CSV_BYTES) {
    return {
      ok: false,
      message: '파일이 너무 큽니다(4MB 초과). 기수를 나눠 올리거나 필요 없는 열을 지우고 다시 받아 주세요.',
    };
  }

  // zip 서명 — .xlsx/.zip 이다. 구글 스프레드시트 다운로드 메뉴에서 가장 흔한 실수.
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    return {
      ok: false,
      message:
        '엑셀 파일(.xlsx)로 보입니다. 구글 폼 → 응답 → ⋮ → "응답 다운로드(.csv)" 로 받은 CSV 파일을 올려 주세요.',
    };
  }
  // 옛 엑셀(.xls)도 CSV 가 아니다.
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) {
    return { ok: false, message: '엑셀 파일(.xls)로 보입니다. CSV 파일로 다시 받아 주세요.' };
  }
  // 텍스트 파일에는 NUL 이 없다(UTF-16 로 저장된 파일도 여기 걸린다).
  if (bytes.subarray(0, 4096).includes(0x00)) {
    return {
      ok: false,
      message: 'CSV 텍스트 파일이 아닙니다. 구글 폼에서 CSV(쉼표로 구분된 값)로 다시 받아 주세요.',
    };
  }

  // 구글 폼이 주는 CSV 는 UTF-8 이다. 여기서 끝나는 것이 정상 경로.
  const utf8 = decode(bytes, 'utf-8', true);
  if (utf8 !== null) return { ok: true, text: utf8, encoding: 'utf-8' };

  // UTF-8 이 아니면 십중팔구 엑셀이 다시 저장한 CP949 다.
  const cp949 = decode(bytes, 'euc-kr', true);
  if (cp949 !== null) return { ok: true, text: cp949, encoding: 'cp949' };

  return {
    ok: false,
    message:
      '글자 인코딩을 알 수 없어 읽지 못했습니다. 구글 폼에서 받은 CSV 원본(UTF-8)을 그대로 올려 주세요.',
  };
}
