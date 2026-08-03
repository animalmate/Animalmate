// 핸드오프 리포트의 순수 로직 — 집계·주기 판정·메일 문안.
// DB 를 타는 부분(getGapReport/sendGapReport)은 여기서 다루지 않는다(테스트 배치 규약).

import { describe, it, expect } from 'vitest';
import {
  summarizeGaps,
  isReportDue,
  reportSince,
  buildGapMail,
  kstDay,
  REPORT_INTERVAL_DAYS,
  type GapRow,
} from './gaps';

const at = (iso: string) => new Date(iso);
const row = (question: string, iso: string): GapRow => ({ question, createdAt: at(iso) });

describe('summarizeGaps', () => {
  it('같은 질문을 묶고 많이 물어본 순으로 낸다', () => {
    const items = summarizeGaps([
      row('회비 얼마예요?', '2026-08-01T01:00:00Z'),
      row('MT 언제 가요', '2026-08-02T01:00:00Z'),
      row('회비 얼마예요?', '2026-08-03T01:00:00Z'),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ question: '회비 얼마예요?', count: 2 });
    expect(items[1]).toMatchObject({ question: 'MT 언제 가요', count: 1 });
  });

  it('공백·문장부호·대소문자 차이는 같은 질문으로 본다', () => {
    const items = summarizeGaps([
      row('  회비   얼마예요? ', '2026-08-01T01:00:00Z'),
      row('회비 얼마예요', '2026-08-02T01:00:00Z'),
      row('MT 장소', '2026-08-02T01:00:00Z'),
      row('mt 장소', '2026-08-02T02:00:00Z'),
    ]);
    expect(items.map((i) => i.count).sort()).toEqual([2, 2]);
  });

  it('묶인 질문의 대표 문구는 가장 최근에 쓴 표현', () => {
    const [item] = summarizeGaps([
      row('봉사 신청 어떻게', '2026-08-01T01:00:00Z'),
      row('봉사 신청 어떻게 하나요?', '2026-08-05T01:00:00Z'), // 문구가 다르니 별개 질문
      row('봉사 신청 어떻게?', '2026-08-03T01:00:00Z'), // 첫 줄과 같은 질문(부호만 다름)
    ]);
    expect(item).toMatchObject({ question: '봉사 신청 어떻게?', count: 2, lastAskedAt: '2026-08-03' });
  });

  it('KST 경계 — UTC 15시 이후는 다음 날로 센다', () => {
    const [item] = summarizeGaps([row('질문', '2026-08-02T15:30:00Z')]);
    expect(item?.lastAskedAt).toBe('2026-08-03');
    expect(kstDay(at('2026-08-02T14:59:00Z'))).toBe('2026-08-02');
  });

  it('공백뿐인 질문은 세지 않는다', () => {
    expect(summarizeGaps([row('   ', '2026-08-01T01:00:00Z')])).toEqual([]);
  });

  it('limit 을 넘으면 자른다', () => {
    const rows = Array.from({ length: 40 }, (_, i) => row(`질문 ${i}`, '2026-08-01T01:00:00Z'));
    expect(summarizeGaps(rows, 5)).toHaveLength(5);
  });
});

describe('isReportDue', () => {
  const now = at('2026-08-10T01:00:00Z'); // KST 2026-08-10

  it('발송 기록이 없으면 보낸다', () => {
    expect(isReportDue(null, now)).toBe(true);
    expect(isReportDue('이상한값', now)).toBe(true);
  });

  it(`${REPORT_INTERVAL_DAYS}일이 지나야 보낸다`, () => {
    expect(isReportDue('2026-08-03', now)).toBe(true); // 7일 경과
    expect(isReportDue('2026-08-04', now)).toBe(false); // 6일
    expect(isReportDue('2026-08-10', now)).toBe(false); // 오늘 이미 보냄
  });
});

describe('reportSince', () => {
  const now = at('2026-08-10T01:00:00Z');

  it('마지막 발송일 0시(KST)부터 — 크론이 밀려도 그 사이 질문이 빠지지 않는다', () => {
    // 2026-08-03 00:00 KST = 2026-08-02T15:00Z
    expect(reportSince('2026-08-03', now).toISOString()).toBe('2026-08-02T15:00:00.000Z');
  });

  it('기록이 없으면 최근 7일', () => {
    expect(reportSince(null, now).toISOString()).toBe('2026-08-03T01:00:00.000Z');
  });

  it('너무 오래된 기록은 30일로 자른다', () => {
    const since = reportSince('2020-01-01', now);
    expect(now.getTime() - since.getTime()).toBe(30 * 86_400_000);
  });
});

describe('buildGapMail', () => {
  it('질문과 횟수를 싣고, 누가 물었는지는 싣지 않는다', () => {
    const { subject, text } = buildGapMail({
      since: '2026-08-03T00:00:00.000Z',
      total: 5,
      items: [
        { question: '회비 얼마예요?', count: 3, lastAskedAt: '2026-08-09' },
        { question: 'MT 언제 가요', count: 1, lastAskedAt: '2026-08-08' },
      ],
    });
    expect(subject).toContain('2건');
    expect(text).toContain('회비 얼마예요?');
    expect(text).toContain('3번 질문됨');
    expect(text).not.toContain('1번 질문됨'); // 1번은 굳이 쓰지 않는다
    expect(text).toContain('총 5건');
  });
});
