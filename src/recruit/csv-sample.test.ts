import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCsv, mapRowToApplicant, detectDuplicates, detectDelimiter, autoMapHeaders } from './csv';

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
