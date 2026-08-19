import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseCsv,
  mapRowToApplicant,
  detectDuplicates,
  detectDelimiter,
  autoMapHeaders,
  missingRequiredMappings,
  mapRowsToApplicants,
  normalizeBirthDate,
} from './csv';

// 지원서에 항목을 추가하고 CSV 경로(csv.ts·업로드 화면·bulkCreateApplicants)를 빠뜨리면
// 업로드가 그 값을 조용히 버린다 — 실제로 가치관 주제·영문 이름이 그렇게 누락돼 있었다.
// 이 테스트는 샘플 CSV 의 모든 열이 끝까지 실려 오는지를 고정한다.
describe('샘플 CSV 검증', () => {
  it('업로드 화면의 자동 매핑 규칙으로 전 항목이 잡히고 값까지 실려 온다', () => {
    const { headers, rows } = parseCsv(readFileSync('samples/recruit-applicants-sample.csv', 'utf8'));
    expect(rows).toHaveLength(51);

    // ⚠ 규칙을 베껴 적지 않는다 — 화면이 실제로 쓰는 함수를 그대로 호출한다.
    //   예전엔 여기서 재현하다가 화면 쪽 버그('영문 이름'이 name 을 덮어씀)를 놓쳤다.
    const m = autoMapHeaders(headers);

    // 19개 열이 모두 어딘가에 매핑돼야 한다(빠지면 업로드에서 조용히 버려진다).
    expect(Object.keys(m).sort()).toEqual([
      'applyRoute','birthDate','department','email','englishName','essayIntro','essayValues',
      'essayValuesTopic','expectedFrequency','gender','name','nearStation','otAttend',
      'otherActivities','phone','remoteInterviewWish','school','wishTeam1','wishTeam2',
    ]);

    const mapped = rows.map((r) => mapRowToApplicant(headers, r, m)).filter(Boolean) as any[];
    // 51행이 전부 살아남아야 한다. name/phone 이 비면 mapRowToApplicant 가 null 을 돌려주는데,
    // 실제로 '영문 이름'이 name 을 덮어써 전원이 여기서 탈락하고 화면에 0명이 떴다.
    expect(mapped).toHaveLength(51);
    expect(mapped.every((x) => x.name && x.phone)).toBe(true);

    const a = mapped[0]!;
    // 이름 칸이 영문 이름으로 덮이지 않았는지 값으로 확인한다.
    expect(a.name).toBe('김서준');
    expect(a.englishName).not.toBe(a.name);
    expect(a.phone).toMatch(/^\d{11}$/);
    expect(a.wishTeam1).toContain('1팀 - 파주/일산');
    expect(a.essayIntro).toContain('\n');          // 줄바꿈 보존
    expect(a.essayIntro).toContain('"임시보호"');   // 따옴표 보존
    expect(a.essayValuesTopic).toBeTruthy();
    expect(mapped.filter((x) => x.englishName).length).toBeGreaterThan(0);
    // 비대면은 체크한 사람만 값이 있다
    const remote = mapped.filter((x) => x.remoteInterviewWish);
    expect(remote.length).toBeGreaterThan(0);
    expect(remote.length).toBeLessThan(mapped.length);

    expect(detectDuplicates(mapped, []).duplicateIndexes).toEqual([50]);
  });
});

// 업로드 화면은 "구글 폼 응답 스프레드시트에서 복사해 붙여넣기"를 안내한다.
// 스프레드시트 Ctrl+C 는 탭 구분(TSV)이라, 쉼표만 보면 전체가 한 열로 들어와 매핑이 통째로 실패한다.
describe('붙여넣기 구분자 자동 판별', () => {
  it('구글 시트에서 복사한 탭 구분 데이터를 열로 나눈다', () => {
    const pasted = '이름\t전화번호\t학교\n홍길동\t01012345678\t가온대학교';
    const { headers, rows } = parseCsv(pasted);
    expect(headers).toEqual(['이름', '전화번호', '학교']);
    expect(rows[0]).toEqual(['홍길동', '01012345678', '가온대학교']);
    expect(detectDelimiter(pasted)).toBe('\t');
  });

  it('쉼표 구분(CSV)도 그대로 동작한다', () => {
    const csv = '이름,전화번호\n홍길동,01012345678';
    expect(parseCsv(csv).headers).toEqual(['이름', '전화번호']);
    expect(detectDelimiter(csv)).toBe(',');
  });

  it('본문에 쉼표가 많은 TSV 도 탭으로 판별한다', () => {
    // 자기소개에 쉼표가 잔뜩 있어도 열 구분은 탭이어야 한다.
    const tsv = '이름\t자기소개\n홍길동\t"안녕하세요, 저는, 동물을, 좋아합니다"';
    expect(detectDelimiter(tsv)).toBe('\t');
    expect(parseCsv(tsv).rows[0]).toEqual(['홍길동', '안녕하세요, 저는, 동물을, 좋아합니다']);
  });
});

describe('자동 항목 연결 규칙', () => {
  it("'영문 이름'이 '이름'을 덮어쓰지 않는다", () => {
    // 실제로 이 버그 때문에 전원의 name 이 비어 업로드 결과가 0명이었다.
    const m = autoMapHeaders(['이름', '전화번호', '영문 이름']);
    expect(m.name).toBe('이름');
    expect(m.englishName).toBe('영문 이름');
  });

  it("'가치관 주제'와 '가치관 답변'을 구분한다", () => {
    const m = autoMapHeaders(['가치관 주제', '가치관 답변']);
    expect(m.essayValuesTopic).toBe('가치관 주제');
    expect(m.essayValues).toBe('가치관 답변');
  });

  it('헤더 순서가 바뀌어도 같은 결과를 낸다', () => {
    const a = autoMapHeaders(['이름', '영문 이름', '가치관 주제', '가치관 답변']);
    const b = autoMapHeaders(['영문 이름', '가치관 답변', '가치관 주제', '이름']);
    expect(a).toEqual(b);
  });

  it('하나의 헤더가 두 항목에 중복 연결되지 않는다', () => {
    const m = autoMapHeaders(['이름', '성별', '학교', '학과', '영문 이름']);
    const used = Object.values(m);
    expect(new Set(used).size).toBe(used.length);
  });
});

// 이름·전화번호가 안 붙으면 모든 행이 버려져 "0명"만 나온다. 왜 0명인지 단서가 없어 실제로 헤맸다.
// 화면과 API 가 이 함수 하나를 같이 본다 — 규칙을 양쪽에 적으면 한쪽만 고쳐진다.
describe('필수 항목 연결 검사', () => {
  const headers = ['타임스탬프', '성함', '연락처', '학교'];

  it('필수 항목이 모두 연결되면 통과한다', () => {
    expect(missingRequiredMappings(headers, { name: '성함', phone: '연락처' })).toEqual([]);
  });

  it('연결이 비어 있으면 잡아낸다', () => {
    expect(missingRequiredMappings(headers, { name: '성함' })).toEqual(['phone']);
    expect(missingRequiredMappings(headers, {})).toEqual(['name', 'phone']);
  });

  it('머리글에 없는 열을 가리키면 연결되지 않은 것으로 본다', () => {
    // 다른 파일을 다시 붙여넣으면 이전 연결이 남는다 — 화면엔 연결된 듯 보이는데 서버는 전부 버린다.
    expect(missingRequiredMappings(headers, { name: '이름', phone: '연락처' })).toEqual(['name']);
  });
});

// 실제 구글 폼(2026-08 기준 18문항) 응답을 그대로 내려받았을 때의 모양.
// 여기서 고정하는 것은 "문항 문구가 이대로일 때 전 항목이 자동으로 연결된다"는 사실이다 —
// 문항 문구를 손보면 이 테스트가 먼저 깨져야 업로드 화면에서 헤매지 않는다.
const GOOGLE_FORM_CSV = `타임스탬프,이름,성별,생년월일(YYYYMMDD),전화번호,학교,학과,이메일,지원경로,자기소개,가치관 확인,다른 대외 활동 또는 아르바이트 등의 활동 계획 여부,예상 활동 참여 주기,희망 팀 조사(1순위),희망 팀 조사(2순위),주소,ot참가 여부,비대면 면접 여부(희망자만 체크),영문 이름
2026. 8. 1 오후 3:24:05,김서준,여,20020903,01012345678,가온대학교,수의예과,seojun@naver.com,에브리타임,"안녕하세요, 저는 강아지를 좋아합니다.
줄바꿈도 있습니다.",국내 유기견 실태에 대한 제 생각은...,편의점 알바 주 2회,격주 1회,1팀,3팀,건대입구역,참석 가능,비대면 면접 희망,Kim Seojun
2026. 8. 1 오후 4:00:00,윤하윤,남,2002.09.09,1098765432,다래대학교,경영학과,hayoon@naver.com,인스타그램,자기소개입니다.,번식장 문제에 대한 생각,없음,매주 1회,2팀,4팀,상수역,참석 가능,,
2026. 8. 1 오후 5:00:00,권예준,여,200209.03,01055556666,미르대학교,사회복지학과,yejun@naver.com,지인 소개,자기소개3,생각3,없음,달에 1번,3팀,5팀,왕십리역,불참,,`;

describe('실제 구글 폼 응답 CSV', () => {
  it('18개 문항이 전부 자동 연결되고 타임스탬프만 남는다', () => {
    const { headers, rows } = parseCsv(GOOGLE_FORM_CSV);
    const m = autoMapHeaders(headers);
    expect(missingRequiredMappings(headers, m)).toEqual([]);
    expect(rows).toHaveLength(3);

    // 연결되지 않아도 되는 열은 구글이 붙이는 타임스탬프뿐이다.
    const used = new Set(Object.values(m));
    expect(headers.filter((h) => !used.has(h))).toEqual(['타임스탬프']);

    // 문항이 하나뿐인 '가치관 확인'이 주제 항목으로 새지 않는다(주제는 별도 문항이 없다).
    expect(m.essayValues).toBe('가치관 확인');
    expect(m.essayValuesTopic).toBeUndefined();
    // 소문자 'ot참가 여부'도 잡는다.
    expect(m.otAttend).toBe('ot참가 여부');
    // '주소' 문항은 인근 역 칸으로 간다(저장은 역명만 하는 것이 원칙 — PII 최소화).
    expect(m.nearStation).toBe('주소');
  });

  it('전화번호와 생년월일이 저장 형태로 정리되어 실린다', () => {
    const { headers, rows } = parseCsv(GOOGLE_FORM_CSV);
    const m = autoMapHeaders(headers);
    const { applicants, skipped } = mapRowsToApplicants(headers, rows, m);

    expect(skipped).toEqual([]);
    expect(applicants.map((a) => a.phone)).toEqual([
      '01012345678',
      '01098765432', // 시트가 떼어먹은 앞 0 을 되살린다
      '01055556666',
    ]);
    expect(applicants.map((a) => a.birthDate)).toEqual(['2002.09.03', '2002.09.09', '2002.09.03']);
    expect(applicants[0]!.essayIntro).toContain('\n');
    // 필수가 아닌 문항은 빈 채로 온다.
    expect(applicants[1]!.remoteInterviewWish).toBeUndefined();
    expect(applicants[1]!.englishName).toBeUndefined();
  });
});

describe('생년월일 표기 정리', () => {
  it('주관식으로 섞여 들어오는 표기를 YYYY.MM.DD 로 맞춘다', () => {
    expect(normalizeBirthDate('20020903')).toBe('2002.09.03');
    expect(normalizeBirthDate('2002.09.09')).toBe('2002.09.09');
    expect(normalizeBirthDate('200209.03')).toBe('2002.09.03'); // 연월만 붙여 쓴 사람
    expect(normalizeBirthDate('2002-9-3')).toBe('2002.09.03');
    expect(normalizeBirthDate('2002. 9. 3')).toBe('2002.09.03');
    expect(normalizeBirthDate('2002.0903')).toBe('2002.09.03');
  });

  it('두 자리 연도는 아직 오지 않은 해면 1900년대로 본다', () => {
    const today = new Date('2026-08-19T00:00:00Z');
    expect(normalizeBirthDate('020903', today)).toBe('2002.09.03');
    expect(normalizeBirthDate('990101', today)).toBe('1999.01.01');
  });

  it('해석이 확실하지 않으면 원문을 그대로 둔다', () => {
    // 잘못 고친 생일은 되돌릴 근거가 없다 — 애매하면 사람이 보게 남긴다.
    expect(normalizeBirthDate('2002년 가을')).toBe('2002년 가을');
    expect(normalizeBirthDate('20021345')).toBe('20021345'); // 13월 45일
    expect(normalizeBirthDate('2002')).toBe('2002');
    expect(normalizeBirthDate('  ')).toBe('');
  });
});

// 예전에는 이름·전화번호가 빈 행을 조용히 버리고 "읽어온 N명"만 보여 줬다.
// 50명을 올렸는데 48명이 들어가도 화면에서는 알 방법이 없었다.
describe('등록되지 못한 행 집계', () => {
  const csv = `이름,전화번호,학교
김서준,01011112222,가온대
윤하윤,,다래대
,01033334444,미르대
이지유,01055556666,한별대`;

  it('버려진 행의 위치와 남은 값을 함께 돌려준다', () => {
    const { headers, rows } = parseCsv(csv);
    const m = autoMapHeaders(headers);
    const { applicants, skipped } = mapRowsToApplicants(headers, rows, m);

    expect(applicants.map((a) => a.name)).toEqual(['김서준', '이지유']);
    expect(skipped).toEqual([
      { row: 2, name: '윤하윤', phone: undefined },
      { row: 3, name: undefined, phone: '01033334444' },
    ]);
  });
});
