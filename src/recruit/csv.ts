// F9 신입 모집 CSV 파서 및 매핑 유틸리티
// 스펙: docs/09-RECRUIT-DESIGN.md §5
// 따옴표, 줄바꿈, 이스케이프쌍("")을 지원하는 상태 기반 CSV 파서.

import { normalizeImportedPhone } from '@/lib/phone';

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/**
 * 구분자 자동 판별(쉼표 / 탭).
 *
 * 왜 필요한가: 업로드 화면은 "구글 폼 응답 스프레드시트에서 복사해 붙여넣기"를 안내하는데,
 * 스프레드시트에서 Ctrl+C 하면 클립보드에 담기는 것은 **탭 구분(TSV)**이다. 쉼표만 보면
 * 전체가 한 열로 들어와 매핑이 통째로 실패한다. 첫 줄에서 따옴표 밖의 구분자 수를 세어 고른다.
 */
export function detectDelimiter(text: string): ',' | '\t' {
  let commas = 0;
  let tabs = 0;
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      // 이스케이프된 따옴표("")는 건너뛴다.
      if (inQuotes && text[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (ch === ',') commas++;
      else if (ch === '\t') tabs++;
      else if (ch === '\n' || ch === '\r') break; // 첫 줄만 본다
    }
  }
  return tabs > commas ? '\t' : ',';
}

/**
 * 상태 기반 CSV 파서 (정규식 split 금지 — 자기소개서의 개행·따옴표를 안전하게 다룬다).
 * 구분자는 쉼표/탭을 자동 판별한다.
 */
export function parseCsv(text: string): ParsedCsv {
  // BOM 제거
  const cleanText = text.replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(cleanText);
  const records: string[][] = [];
  let currentRecord: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++; // 두 번째 따옴표 건너뜀
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        currentRecord.push(currentField.trim());
        currentField = '';
      } else if (char === '\r') {
        if (nextChar === '\n') {
          i++;
        }
        currentRecord.push(currentField.trim());
        records.push(currentRecord);
        currentRecord = [];
        currentField = '';
      } else if (char === '\n') {
        currentRecord.push(currentField.trim());
        records.push(currentRecord);
        currentRecord = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  if (currentField !== '' || currentRecord.length > 0) {
    currentRecord.push(currentField.trim());
    records.push(currentRecord);
  }

  // 첫 번째 행은 헤더
  const headers = records.length > 0 ? records[0]! : [];
  const rows = records.slice(1).filter((r) => r.some((cell) => cell.length > 0));

  return { headers, rows };
}

export interface ApplicantImportInput {
  name: string;
  phone: string;
  gender?: string;
  birthDate?: string;
  school?: string;
  department?: string;
  email?: string;
  applyRoute?: string;
  otherActivities?: string;
  expectedFrequency?: string;
  wishTeam1?: string;
  wishTeam2?: string;
  nearStation?: string;
  otAttend?: string;
  remoteInterviewWish?: string;
  essayIntro?: string;
  essayValues?: string;
  essayValuesTopic?: string;
  englishName?: string;
}

/**
 * 생년월일 표기를 `YYYY.MM.DD` 로 맞춘다.
 *
 * 왜 필요한가: 지원서는 `YYYYMMDD` 로 안내하지만 주관식이라 실제 응답은 제각각으로 온다
 * — "20020903", "2002.09.09", "200209.03", "2002-09-03", "020903". 심사·면접 화면은 이 값을
 * 그대로 보여 주므로, 손대지 않으면 한 명씩 표기가 달라 나이를 눈으로 비교하기 어렵다.
 *
 * **해석이 확실할 때만** 바꾼다. 자릿수가 맞지 않거나 월·일이 범위를 벗어나면 원문을 그대로 둔다
 * — 지원자가 적어 낸 값을 우리가 지어내지 않는다(잘못 고친 생일은 되돌릴 근거가 없다).
 */
export function normalizeBirthDate(raw: string, today: Date = new Date()): string {
  const trimmed = raw.trim();
  // 숫자 덩어리로 끊는다. "2002. 9. 3"(3덩어리)와 "200209.03"(2덩어리)이 서로 다른 모양이라
  // 전부 이어 붙여 8자리로 보면 "200293" 처럼 뜻이 달라진다.
  const parts = trimmed.split(/[^0-9]+/).filter((p) => p !== '');
  let y = '';
  let m = '';
  let d = '';

  if (parts.length === 3) {
    [y, m, d] = parts as [string, string, string];
  } else if (parts.length === 2 && parts[0]!.length === 6) {
    // "200209.03" — 연월이 붙고 일만 떨어진 모양.
    y = parts[0]!.slice(0, 4);
    m = parts[0]!.slice(4);
    d = parts[1]!;
  } else if (parts.length === 2 && parts[0]!.length === 4 && parts[1]!.length === 4) {
    // "2002.0903"
    y = parts[0]!;
    m = parts[1]!.slice(0, 2);
    d = parts[1]!.slice(2);
  } else if (parts.length === 1 && parts[0]!.length === 8) {
    y = parts[0]!.slice(0, 4);
    m = parts[0]!.slice(4, 6);
    d = parts[0]!.slice(6);
  } else if (parts.length === 1 && parts[0]!.length === 6) {
    // "020903" — 두 자리 연도. 아직 오지 않은 해면 1900년대로 본다(2026년이면 27~99 → 19xx).
    y = parts[0]!.slice(0, 2);
    m = parts[0]!.slice(2, 4);
    d = parts[0]!.slice(4);
  } else {
    return trimmed;
  }

  if (y.length === 2) {
    const yy = Number(y);
    const currentTwo = today.getFullYear() % 100;
    y = String(yy <= currentTwo ? 2000 + yy : 1900 + yy);
  }
  if (y.length !== 4 || m.length > 2 || d.length > 2) return trimmed;

  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const inRange =
    year >= 1900 && year <= today.getFullYear() && month >= 1 && month <= 12 && day >= 1 && day <= 31;
  if (!inRange) return trimmed;

  return `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
}

/** 연결된 열에서 값을 읽는 함수를 만든다(빈 칸은 undefined). 매핑·누락 판정이 같은 눈으로 보게 한다. */
function fieldReader(headers: string[], row: string[], mapping: Record<string, string>) {
  const headerMap = new Map<string, number>();
  headers.forEach((h, idx) => headerMap.set(h, idx));

  return (fieldKey: string): string | undefined => {
    const csvHeader = mapping[fieldKey];
    if (!csvHeader) return undefined;
    const idx = headerMap.get(csvHeader);
    if (idx === undefined || idx >= row.length) return undefined;
    const val = row[idx]?.trim();
    return val && val !== '' ? val : undefined;
  };
}

/**
 * 헤더 매핑({ [applicantField]: csvHeader })을 사용하여 행 데이터를 ApplicantImportInput으로 변환
 */
export function mapRowToApplicant(
  headers: string[],
  row: string[],
  mapping: Record<string, string>
): ApplicantImportInput | null {
  const getValue = fieldReader(headers, row, mapping);

  const name = getValue('name');
  const phone = getValue('phone');

  if (!name || !phone) {
    return null; // 필수 필드 미비 시 비활성
  }

  const birthDate = getValue('birthDate');

  return {
    name,
    // 숫자만 남기는 데서 그치지 않는다 — 시트를 거치며 떨어진 앞 0 을 되살려야 지원자가
    // 자기 번호로 결과를 조회할 수 있다(lookup 은 이름+전화 완전 일치).
    phone: normalizeImportedPhone(phone),
    gender: getValue('gender'),
    birthDate: birthDate ? normalizeBirthDate(birthDate) : undefined,
    school: getValue('school'),
    department: getValue('department'),
    email: getValue('email'),
    applyRoute: getValue('applyRoute'),
    otherActivities: getValue('otherActivities'),
    expectedFrequency: getValue('expectedFrequency'),
    wishTeam1: getValue('wishTeam1'),
    wishTeam2: getValue('wishTeam2'),
    nearStation: getValue('nearStation'),
    otAttend: getValue('otAttend'),
    remoteInterviewWish: getValue('remoteInterviewWish'),
    essayIntro: getValue('essayIntro'),
    essayValues: getValue('essayValues'),
    essayValuesTopic: getValue('essayValuesTopic'),
    englishName: getValue('englishName'),
  };
}

/** 이름·전화번호가 없어 등록되지 못한 행. 사람이 원본에서 찾을 수 있게 위치와 남은 값을 함께 준다. */
export interface SkippedRow {
  /** 머리글을 뺀 데이터 기준 몇 번째 행인가(1부터). 자기소개서에 줄바꿈이 있어 파일 줄 번호와는 다르다. */
  row: number;
  name?: string;
  phone?: string;
}

/**
 * 행 전체를 지원자로 바꾸고, **버려진 행을 함께 돌려준다**.
 *
 * 왜 세는가: mapRowToApplicant 는 이름이나 전화번호가 비면 조용히 null 을 준다. 예전에는 그대로
 * 버리고 "읽어온 지원자 N명"만 보여 줬는데, 50명을 올렸는데 48명만 들어가도 화면에서는 알 수가 없다
 * (48 이 맞는 숫자인지 아는 사람은 없다). 몇 행이 왜 빠졌는지 같이 보여 줘야 사람이 판단할 수 있다.
 */
export function mapRowsToApplicants(
  headers: string[],
  rows: string[][],
  mapping: Record<string, string>
): { applicants: ApplicantImportInput[]; skipped: SkippedRow[] } {
  const applicants: ApplicantImportInput[] = [];
  const skipped: SkippedRow[] = [];

  rows.forEach((row, idx) => {
    const applicant = mapRowToApplicant(headers, row, mapping);
    if (applicant) {
      applicants.push(applicant);
      return;
    }
    const getValue = fieldReader(headers, row, mapping);
    skipped.push({ row: idx + 1, name: getValue('name'), phone: getValue('phone') });
  });

  return { applicants, skipped };
}

/**
 * 이름+전화번호 중복 감지
 */
export function detectDuplicates(
  newApplicants: ApplicantImportInput[],
  existingApplicants: { name: string; phone: string }[]
): { duplicateIndexes: number[]; uniqueApplicants: ApplicantImportInput[] } {
  const existingSet = new Set(
    existingApplicants.map((a) => `${a.name.trim()}_${a.phone.replace(/[^0-9]/g, '')}`)
  );

  const duplicateIndexes: number[] = [];
  const uniqueApplicants: ApplicantImportInput[] = [];

  newApplicants.forEach((item, idx) => {
    const key = `${item.name.trim()}_${item.phone.replace(/[^0-9]/g, '')}`;
    if (existingSet.has(key)) {
      duplicateIndexes.push(idx);
    } else {
      uniqueApplicants.push(item);
      existingSet.add(key); // 동일 파일 내 중복도 방지
    }
  });

  return { duplicateIndexes, uniqueApplicants };
}

/**
 * 헤더 이름을 보고 지원 항목을 자동 연결한다.
 *
 * 이 함수를 화면과 테스트가 **같이** 쓴다. 예전에는 업로드 화면 안에 규칙이 인라인으로 있었고
 * 테스트는 그 규칙을 따로 베껴 적었는데, 베낀 쪽만 고쳐 놓는 바람에 실제 화면의 버그
 * ("영문 이름"이 '이름'을 포함해 name 을 덮어써 전원이 걸러지던 문제)를 놓쳤다.
 *
 * 규칙은 **구체적인 것부터** 확인하고, 이미 연결된 헤더는 다시 쓰지 않는다.
 */
export function autoMapHeaders(headers: string[]): Record<string, string> {
  // [항목키, 헤더 판별]. 순서 = 우선순위(구체적인 것 먼저).
  const RULES: [string, (h: string) => boolean][] = [
    ['englishName', (h) => h.includes('영문')],
    ['essayValuesTopic', (h) => h.includes('가치관') && h.includes('주제')],
    ['essayValues', (h) => h.includes('가치관')],
    ['essayIntro', (h) => h.includes('소개')],
    ['phone', (h) => h.includes('전화') || h.includes('연락처')],
    // '이름'은 '영문 이름'과 겹치므로 englishName 을 먼저 소비시킨 뒤에 본다.
    ['name', (h) => h.includes('이름') || h.includes('성함')],
    ['birthDate', (h) => h.includes('생년월일') || h.includes('생일')],
    ['gender', (h) => h.includes('성별')],
    ['school', (h) => h.includes('학교')],
    ['department', (h) => h.includes('학과') || h.includes('전공')],
    ['email', (h) => h.includes('메일')],
    ['applyRoute', (h) => h.includes('경로')],
    ['nearStation', (h) => h.includes('역') || h.includes('주소')],
    ['otAttend', (h) => h.includes('OT') || h.includes('참가')],
    ['remoteInterviewWish', (h) => h.includes('비대면')],
    ['wishTeam1', (h) => h.includes('1순위') || h.includes('1지망')],
    ['wishTeam2', (h) => h.includes('2순위') || h.includes('2지망')],
    ['expectedFrequency', (h) => h.includes('주기')],
    ['otherActivities', (h) => h.includes('대외') || h.includes('아르바이트')],
  ];

  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  for (const [field, match] of RULES) {
    const hit = headers.find((h) => !used.has(h) && match(h));
    if (hit) {
      mapping[field] = hit;
      used.add(hit);
    }
  }
  return mapping;
}

/** 이 둘이 연결되지 않으면 mapRowToApplicant 가 모든 행을 버려 "0명"만 남는다. */
export const REQUIRED_MAPPING_FIELDS = ['name', 'phone'] as const;
export type RequiredMappingField = (typeof REQUIRED_MAPPING_FIELDS)[number];

export const REQUIRED_MAPPING_LABELS: Record<RequiredMappingField, string> = {
  name: '이름',
  phone: '전화번호',
};

/**
 * 필수 항목 중 아직 엑셀 열에 연결되지 않은 것들.
 * 연결값이 실제 머리글 목록에 있는지까지 본다 — 다른 파일을 다시 붙여넣으면 지금 없는 열을
 * 가리킨 채 남을 수 있고, 그러면 화면은 "연결됨"으로 보이는데 서버는 전부 버린다.
 *
 * 업로드 화면과 API 가 같은 함수를 쓴다. 규칙을 양쪽에 따로 적으면 한쪽만 고쳐져
 * 화면은 통과시키고 서버는 막는(또는 그 반대) 상태가 된다.
 */
export function missingRequiredMappings(
  headers: string[],
  mapping: Record<string, string>
): RequiredMappingField[] {
  return REQUIRED_MAPPING_FIELDS.filter((k) => {
    const header = mapping[k];
    return !header || !headers.includes(header);
  });
}
