import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCsv, mapRowToApplicant, detectDuplicates } from './csv';

// 지원서에 항목을 추가하고 CSV 경로(csv.ts·업로드 화면·bulkCreateApplicants)를 빠뜨리면
// 업로드가 그 값을 조용히 버린다 — 실제로 가치관 주제·영문 이름이 그렇게 누락돼 있었다.
// 이 테스트는 샘플 CSV 의 모든 열이 끝까지 실려 오는지를 고정한다.
describe('샘플 CSV 검증', () => {
  it('업로드 화면의 자동 매핑 규칙으로 전 항목이 잡히고 값까지 실려 온다', () => {
    const { headers, rows } = parseCsv(readFileSync('samples/recruit-applicants-sample.csv', 'utf8'));
    expect(rows).toHaveLength(51);

    // 업로드 패널의 자동 매핑 규칙을 그대로 재현한다.
    const m: Record<string, string> = {};
    for (const h of headers) {
      if (h.includes('이름') && !h.includes('영문')) m.name = h;
      if (h.includes('전화') || h.includes('연락처')) m.phone = h;
      if (h.includes('성별')) m.gender = h;
      if (h.includes('생년월일')) m.birthDate = h;
      if (h.includes('학교')) m.school = h;
      if (h.includes('학과')) m.department = h;
      if (h.includes('메일')) m.email = h;
      if (h.includes('경로')) m.applyRoute = h;
      if (h.includes('역') || h.includes('주소')) m.nearStation = h;
      if (h.includes('소개')) m.essayIntro = h;
      if (h.includes('가치관') && h.includes('주제')) m.essayValuesTopic = h;
      else if (h.includes('가치관')) m.essayValues = h;
      if (h.includes('영문')) m.englishName = h;
      if (h.includes('비대면')) m.remoteInterviewWish = h;
      if (h.includes('OT') || h.includes('참가')) m.otAttend = h;
      if (h.includes('1순위') || h.includes('1지망')) m.wishTeam1 = h;
      if (h.includes('2순위') || h.includes('2지망')) m.wishTeam2 = h;
      if (h.includes('주기')) m.expectedFrequency = h;
      if (h.includes('대외') || h.includes('아르바이트')) m.otherActivities = h;
    }
    // 19개 열이 모두 어딘가에 매핑돼야 한다(빠지면 업로드에서 조용히 버려진다).
    expect(Object.keys(m).sort()).toEqual([
      'applyRoute','birthDate','department','email','englishName','essayIntro','essayValues',
      'essayValuesTopic','expectedFrequency','gender','name','nearStation','otAttend',
      'otherActivities','phone','remoteInterviewWish','school','wishTeam1','wishTeam2',
    ]);

    const mapped = rows.map((r) => mapRowToApplicant(headers, r, m)).filter(Boolean) as any[];
    const a = mapped[0]!;
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
