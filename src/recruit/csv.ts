// F9 신입 모집 CSV 파서 및 매핑 유틸리티
// 스펙: docs/09-RECRUIT-DESIGN.md §5
// 따옴표, 줄바꿈, 이스케이프쌍("")을 지원하는 상태 기반 CSV 파서.

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
 * 헤더 매핑({ [applicantField]: csvHeader })을 사용하여 행 데이터를 ApplicantImportInput으로 변환
 */
export function mapRowToApplicant(
  headers: string[],
  row: string[],
  mapping: Record<string, string>
): ApplicantImportInput | null {
  const headerMap = new Map<string, number>();
  headers.forEach((h, idx) => headerMap.set(h, idx));

  const getValue = (fieldKey: string): string | undefined => {
    const csvHeader = mapping[fieldKey];
    if (!csvHeader) return undefined;
    const idx = headerMap.get(csvHeader);
    if (idx === undefined || idx >= row.length) return undefined;
    const val = row[idx]?.trim();
    return val && val !== '' ? val : undefined;
  };

  const name = getValue('name');
  const phone = getValue('phone');

  if (!name || !phone) {
    return null; // 필수 필드 미비 시 비활성
  }

  // 전화번호 정규화 (숫자만 추출하거나 하이픈 통일)
  const cleanPhone = phone.replace(/[^0-9]/g, '');

  return {
    name,
    phone: cleanPhone,
    gender: getValue('gender'),
    birthDate: getValue('birthDate'),
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
