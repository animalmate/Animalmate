// 챗봇 쿼터 — 인당 일일 상한 + 전역 분기 상한 + 킬스위치(결정 3).
//
// 왜: LLM 호출은 돈이 든다. 한 사람이 무한정 쓰거나, 전체 합이 분기 예산을 넘으면 안 된다.
// 상한값은 상수가 아니라 app_settings 에 두어 회장단이 콘솔에서 조정한다.
// 카운트 기준은 chat_logs(질의 1건 = 1행). 전역 상한에 처음 도달하면 챗봇을 끄고 회장단에 알린다.

import { and, gte, eq, sql } from 'drizzle-orm';
import type { Db, Database } from '@/db/types';
import { chatLogs } from '@/db/schema';
import type { Actor } from '@/auth/permissions';
import { getSettings, setSettingSystem } from './settings';
import { boardEmails } from '@/auth/operators';
import { defaultMailer, type Mailer } from '@/auth/mailer';

// 설정 키(app_settings). 없으면 아래 기본값.
export const SETTING_KEYS = {
  enabled: 'chatbot_enabled',
  dailyPerUser: 'chatbot_daily_per_user',
  globalQuarter: 'chatbot_global_quarter',
} as const;

// 기본값. 전역 분기 상한은 예산에서 역산: gemini-3.1-flash-lite 로 질의 1건 ≈ 1~2원(입력 2k+출력 300토큰 가정),
// 분기 예산 1만원 ÷ ≈1.3원 ≈ 7700건 → 안전 마진 두고 6000. 회장단이 콘솔에서 조정 가능.
export const DEFAULTS = {
  enabled: true,
  dailyPerUser: 30,
  globalQuarter: 6000,
} as const;

export type QuotaReason = 'disabled' | 'daily_user' | 'global';
export interface QuotaResult {
  allowed: boolean;
  reason?: QuotaReason;
  /** 사용자 안내용 남은 횟수(일일). */
  dailyRemaining?: number;
}

/** KST 자정(오늘 시작)·분기 시작 시각. chat_logs.created_at 과 비교. */
function kstDayStart(now: Date): Date {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  kst.setUTCHours(0, 0, 0, 0);
  return new Date(kst.getTime() - 9 * 3600 * 1000);
}
function kstQuarterStart(now: Date): Date {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const q = Math.floor(kst.getUTCMonth() / 3) * 3; // 0,3,6,9
  const start = Date.UTC(kst.getUTCFullYear(), q, 1, 0, 0, 0);
  return new Date(start - 9 * 3600 * 1000);
}

async function countSince(db: Database, since: Date, userId?: string) {
  const conds = [gte(chatLogs.createdAt, since)];
  if (userId) conds.push(eq(chatLogs.userId, userId));
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(chatLogs).where(and(...conds));
  return row?.n ?? 0;
}

export interface QuotaDeps {
  now?: Date;
  mailer?: Mailer;
  /** 전역 상한 도달 알림 수신자(기본 회장단). */
  alertEmails?: () => Promise<string[]>;
}

/**
 * 질의 전에 호출. 막히면 allowed=false + 사유. 전역 상한에 **처음** 도달하면 킬스위치를 내리고
 * 회장단에 1회 알린다(이미 disabled 면 알림 안 보냄 = 중복 방지).
 */
export async function checkQuota(db: Db, actor: Actor, deps: QuotaDeps = {}): Promise<QuotaResult> {
  const now = deps.now ?? new Date();
  const s = await getSettings(db, Object.values(SETTING_KEYS));
  const enabled = (s[SETTING_KEYS.enabled] as boolean | undefined) ?? DEFAULTS.enabled;
  const dailyLimit = (s[SETTING_KEYS.dailyPerUser] as number | undefined) ?? DEFAULTS.dailyPerUser;
  const globalLimit = (s[SETTING_KEYS.globalQuarter] as number | undefined) ?? DEFAULTS.globalQuarter;

  if (!enabled) return { allowed: false, reason: 'disabled' };

  const globalCount = await countSince(db, kstQuarterStart(now));
  if (globalCount >= globalLimit) {
    // 전역 상한 도달 → 챗봇을 끄고 회장단에 알린다(enabled 였을 때 한 번만).
    await disableAndAlert(db, globalCount, globalLimit, deps);
    return { allowed: false, reason: 'global' };
  }

  const userCount = await countSince(db, kstDayStart(now), actor.userId);
  if (userCount >= dailyLimit) return { allowed: false, reason: 'daily_user' };

  return { allowed: true, dailyRemaining: Math.max(0, dailyLimit - userCount) };
}

export interface UsageStats {
  enabled: boolean;
  dailyPerUser: number;
  globalQuarter: number; // 상한
  globalUsedThisQuarter: number; // 현재 사용량
  todayTotal: number; // 오늘 전체 질의 수(참고)
}

/** 콘솔 표시용 사용량·설정 스냅샷(회장단). */
export async function getUsage(db: Db, now: Date = new Date()): Promise<UsageStats> {
  const s = await getSettings(db, Object.values(SETTING_KEYS));
  const [globalUsed, today] = await Promise.all([countSince(db, kstQuarterStart(now)), countSince(db, kstDayStart(now))]);
  return {
    enabled: (s[SETTING_KEYS.enabled] as boolean | undefined) ?? DEFAULTS.enabled,
    dailyPerUser: (s[SETTING_KEYS.dailyPerUser] as number | undefined) ?? DEFAULTS.dailyPerUser,
    globalQuarter: (s[SETTING_KEYS.globalQuarter] as number | undefined) ?? DEFAULTS.globalQuarter,
    globalUsedThisQuarter: globalUsed,
    todayTotal: today,
  };
}

async function disableAndAlert(db: Db, count: number, limit: number, deps: QuotaDeps): Promise<void> {
  await setSettingSystem(db, SETTING_KEYS.enabled, false); // 킬스위치 down
  try {
    const to = deps.alertEmails ? await deps.alertEmails() : await boardEmails(db);
    if (to.length === 0) return;
    const mailer = deps.mailer ?? defaultMailer();
    await mailer.send({
      to,
      subject: '[애니멀메이트] 챗봇 분기 사용 한도 도달 — 자동 비활성화',
      text:
        `챗봇이 이번 분기 사용 한도(${limit}건)에 도달해 자동으로 꺼졌습니다(현재 ${count}건).\n\n` +
        `예산 상황을 확인한 뒤, 다시 켜려면 콘솔에서 챗봇을 활성화하거나 분기 한도를 조정하세요.`,
    });
  } catch {
    /* 알림 실패가 킬스위치를 막지 않게 조용히 넘어간다(킬스위치는 이미 내려갔다). */
  }
}
