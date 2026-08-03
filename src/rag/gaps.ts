// 챗봇이 **답하지 못한 질문**(핸드오프) 집계 — 문서 최신화의 자동 to-do 목록.
//
// 왜 만드나: `chat_logs.handed_off` 는 질의마다 이미 쌓이고 있었지만 읽는 곳이 본인 대화 복원
// (history.ts)뿐이라, "부원들이 물었는데 답이 없던 질문"이 매일 DB에 쌓이기만 하고 아무도 보지 않았다.
// 동아리 문서는 아무도 부지런히 고치지 않는다 — 그래서 **무엇을 고쳐야 하는지가 사람을 찾아가야** 한다.
// 콘솔 카드(회장단이 열었을 때) + 주 1회 메일(안 열어도 도착) 두 경로로 같은 목록을 낸다.
//
// ⚠ 이 목록에 **누가 물었는지는 넣지 않는다.** 질문 내용만으로 문서를 채우는 데 충분하고,
// "누가 무엇을 물었나"는 운영진이 들여다볼 이유가 없는 정보다(질문에는 개인 사정이 섞인다).

import { and, desc, eq, gte } from 'drizzle-orm';
import type { Db, Database } from '@/db/types';
import { chatLogs } from '@/db/schema';
import { getSettings, setSettingSystem } from './settings';
import { boardEmails } from '@/auth/operators';
import { defaultMailer, type Mailer } from '@/auth/mailer';

/** 마지막 리포트 발송일(YYYY-MM-DD, KST). 주기 판정 + 중복 발송 방지. */
export const GAP_REPORT_SENT_ON = 'chatbot_gap_report_sent_on';

/** 리포트 주기(일). 매일 오면 읽지 않게 되고, 한 달이면 잊는다. */
export const REPORT_INTERVAL_DAYS = 7;
/** 리포트가 한동안 안 돌았을 때(크론 중단 등) 거슬러 올라갈 최대 범위. */
const MAX_WINDOW_DAYS = 30;
/** 메일·콘솔에 싣는 질문 종류 수 상한. 300명 규모에서 이보다 길면 읽지 않는다. */
export const GAP_LIMIT = 30;
/** 집계 전에 DB 에서 끌어올 원본 행 수 상한(질문 종류가 아니라 질의 건수). */
const FETCH_LIMIT = 300;

export interface GapRow {
  question: string;
  createdAt: Date;
}

export interface GapItem {
  question: string;
  /** 같은 질문이 몇 번 나왔나. 여러 명이 물었다면 그만큼 급한 구멍이다. */
  count: number;
  /** 마지막으로 물어본 날(YYYY-MM-DD, KST). */
  lastAskedAt: string;
}

export interface GapReport {
  /** 집계 시작 시각(ISO). */
  since: string;
  /** 기간 내 핸드오프 **질의 건수**(질문 종류 수가 아니다). */
  total: number;
  items: GapItem[];
}

const KST_MS = 9 * 3600 * 1000;

/** KST 기준 날짜(YYYY-MM-DD). */
export function kstDay(d: Date): string {
  return new Date(d.getTime() + KST_MS).toISOString().slice(0, 10);
}

/**
 * 같은 질문을 묶는 키. 앞뒤 공백·연속 공백·문장부호만 정리한다.
 * **의미로 묶지 않는다** — 유사 질문 군집화는 임베딩이 필요한 별개 작업이고,
 * 이 규모에서는 글자 그대로 같은 질문을 묶는 것만으로 목록이 충분히 짧아진다.
 */
function groupKey(q: string): string {
  return q.trim().replace(/\s+/g, ' ').replace(/[?？!！.。]+$/, '').toLowerCase();
}

/**
 * 원본 행 → 질문별 집계. 많이 물어본 순, 같으면 최근 순.
 *
 * 순수 함수라 DB 없이 검증한다(테스트 배치 규약: src/** 는 순수 단위 테스트).
 */
export function summarizeGaps(rows: GapRow[], limit = GAP_LIMIT): GapItem[] {
  const byKey = new Map<string, { question: string; count: number; last: Date }>();
  for (const r of rows) {
    const key = groupKey(r.question);
    if (!key) continue; // 빈 질문(공백만)은 셀 것이 없다
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { question: r.question.trim(), count: 1, last: r.createdAt });
      continue;
    }
    prev.count += 1;
    // 대표 문구는 **가장 최근에 쓴 표현**으로 둔다(질문이 다듬어졌다면 나중 것이 읽기 낫다).
    if (r.createdAt > prev.last) {
      prev.last = r.createdAt;
      prev.question = r.question.trim();
    }
  }
  return [...byKey.values()]
    .sort((a, b) => b.count - a.count || b.last.getTime() - a.last.getTime())
    .slice(0, limit)
    .map((v) => ({ question: v.question, count: v.count, lastAskedAt: kstDay(v.last) }));
}

/**
 * 이번 리포트가 덮을 시작 시각. 마지막 발송일 다음날 0시(KST)부터 — 크론이 며칠 밀려도
 * 그 사이 질문이 빠지지 않는다. 발송 기록이 없거나 너무 오래됐으면 최대 범위로 자른다.
 */
export function reportSince(lastSentOn: string | null, now: Date): Date {
  const floor = new Date(now.getTime() - MAX_WINDOW_DAYS * 86_400_000);
  if (!lastSentOn || !/^\d{4}-\d{2}-\d{2}$/.test(lastSentOn)) {
    return new Date(now.getTime() - REPORT_INTERVAL_DAYS * 86_400_000);
  }
  // 마지막 발송일 당일 0시(KST) = UTC 로 전날 15시.
  const start = new Date(`${lastSentOn}T00:00:00Z`).getTime() - KST_MS;
  return new Date(Math.max(start, floor.getTime()));
}

/** 'YYYY-MM-DD' → 일 단위 정수(날짜 차이만 쓰므로 기준점은 아무래도 좋다). */
function dayNumber(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) / 86_400_000;
}

/** 주기가 됐나(마지막 발송일로부터 REPORT_INTERVAL_DAYS 경과). 기록이 없으면 지금 보낸다. */
export function isReportDue(lastSentOn: string | null, now: Date): boolean {
  if (!lastSentOn || !/^\d{4}-\d{2}-\d{2}$/.test(lastSentOn)) return true;
  return dayNumber(kstDay(now)) - dayNumber(lastSentOn) >= REPORT_INTERVAL_DAYS;
}

/** 기간 내 핸드오프 질문 집계. 콘솔 카드와 메일이 같은 함수를 쓴다(두 곳이 어긋나지 않게). */
export async function getGapReport(db: Database, since: Date, limit = GAP_LIMIT): Promise<GapReport> {
  const rows = await db
    .select({ question: chatLogs.question, createdAt: chatLogs.createdAt })
    .from(chatLogs)
    .where(and(eq(chatLogs.handedOff, true), gte(chatLogs.createdAt, since)))
    .orderBy(desc(chatLogs.createdAt))
    .limit(FETCH_LIMIT);
  return { since: since.toISOString(), total: rows.length, items: summarizeGaps(rows, limit) };
}

/** 콘솔 표시용 — 최근 REPORT_INTERVAL_DAYS 일치. */
export async function getRecentGaps(db: Db, now: Date = new Date(), days = REPORT_INTERVAL_DAYS): Promise<GapReport> {
  return getGapReport(db, new Date(now.getTime() - days * 86_400_000));
}

export function buildGapMail(report: GapReport): { subject: string; text: string } {
  const lines = report.items.map(
    (it, i) => `${i + 1}. ${it.question}${it.count > 1 ? ` (${it.count}번 질문됨)` : ''} — 마지막 ${it.lastAskedAt}`
  );
  return {
    subject: `[애니멀메이트] 챗봇이 답하지 못한 질문 ${report.items.length}건`,
    text:
      `지난 ${REPORT_INTERVAL_DAYS}일 동안 챗봇이 답하지 못하고 "운영진에게 문의하세요"로 넘긴 질문입니다.\n` +
      `여기에 답이 될 내용을 문서에 채워 넣으면 다음부터는 챗봇이 대신 답합니다.\n\n` +
      `${lines.join('\n')}\n\n` +
      `총 ${report.total}건의 질문이 답을 받지 못했습니다.\n` +
      `문서 추가·수정: 콘솔 → 문서\n`,
  };
}

export interface GapReportSummary {
  /** 주기가 안 됐으면 skipped. 주기가 됐지만 질문이 없으면 sent=false + empty. */
  skipped: boolean;
  sent: boolean;
  questions: number; // 질문 종류 수
  total: number; // 질의 건수
}

export interface GapReportDeps {
  mailer?: Mailer;
  now?: Date;
  recipients?: () => Promise<string[]>;
}

/**
 * 주 1회 회장단 메일. 크론(매일)이 호출하고 **주기 판정은 여기서** 한다
 * (pg_cron 잡을 새로 등록하지 않는다 — 규칙 #7 과 무관하게, 잡이 늘면 인수인계가 어려워진다).
 *
 * 질문이 하나도 없어도 **발송일은 기록한다.** 기록하지 않으면 다음 날 질문이 하나 생기는 순간
 * 메일이 나가 "주 1회"가 "질문 생길 때마다"로 변한다.
 */
export async function sendGapReport(db: Db, deps: GapReportDeps = {}): Promise<GapReportSummary> {
  const now = deps.now ?? new Date();
  const s = await getSettings(db, [GAP_REPORT_SENT_ON]);
  const lastSentOn = (s[GAP_REPORT_SENT_ON] as string | undefined) ?? null;
  if (!isReportDue(lastSentOn, now)) return { skipped: true, sent: false, questions: 0, total: 0 };

  const report = await getGapReport(db, reportSince(lastSentOn, now));
  await setSettingSystem(db, GAP_REPORT_SENT_ON, kstDay(now));
  if (report.items.length === 0) return { skipped: false, sent: false, questions: 0, total: 0 };

  const to = deps.recipients ? await deps.recipients() : await boardEmails(db);
  if (to.length === 0) return { skipped: false, sent: false, questions: report.items.length, total: report.total };

  const { subject, text } = buildGapMail(report);
  await (deps.mailer ?? defaultMailer()).send({ to, subject, text });
  return { skipped: false, sent: true, questions: report.items.length, total: report.total };
}
