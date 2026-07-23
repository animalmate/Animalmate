// 미완성 점검 — 발행 D-3/D-1 에 필수 필드 미완성(status='draft') 예약이 있으면 팀장단에게 알림 메일.
// (구 draft-generate 자동 회차 생성 로직을 대체.) 크론(매일) → /api/cron/draft-generate 가 호출.
//
// 결정(2026-07-23):
//  - 기준: publish_at − 3일(고정). D-1 에도 미완성이면 한 번 더, "내일 발행 보류 예정"으로 격상.
//  - 중복 방지: notice_check_log(post_id + 알림일 유니크).
//  - 발행 시각 도달 시 미완성이면 애초에 status='scheduled' 가 아니므로 발행 큐에 없어 자동 보류됨.

import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Db } from '@/db/types';
import { scheduledPosts, events, teamMembers, users, noticeCheckLog } from '@/db/schema';
import { buildAuditEntry, recordAudit } from '@/auth/audit';
import type { Mailer } from '@/auth/mailer';
import { dryMailer } from '@/auth/mailer';
import { boardEmails } from '@/auth/operators';

const KST_MS = 9 * 3600 * 1000;

interface CalDate {
  year: number;
  month: number;
  day: number;
}
function kstDate(d: Date): CalDate {
  const k = new Date(d.getTime() + KST_MS);
  return { year: k.getUTCFullYear(), month: k.getUTCMonth() + 1, day: k.getUTCDate() };
}
function daysBetween(a: CalDate, b: CalDate): number {
  return Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / 86_400_000);
}
function fmt(c: CalDate): string {
  return `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;
}

export interface ReadinessSummary {
  checkedAt: string;
  incomplete: number; // 미완성 예약 수(D-3/D-1 대상)
  alertsSent: number; // 실제 알림 발송 수(중복 제외)
  escalated: number; // D-1 격상 알림 수
}

export interface ReadinessDeps {
  mailer?: Mailer;
  now?: Date;
}

// 팀 소유 예약의 팀장단 이메일, 개인 소유는 작성자 이메일.
// 팀장단(team_members)이 배정되지 않았으면 회장단으로 폴백(알림이 아무에게도 안 가는 것을 방지).
async function recipientsFor(db: Db, post: typeof scheduledPosts.$inferSelect): Promise<string[]> {
  if (post.ownerType === 'team') {
    const rows = await db
      .select({ email: users.email })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .where(and(eq(teamMembers.teamId, post.ownerId), eq(teamMembers.position, 'leader')));
    if (rows.length > 0) return rows.map((r) => r.email);
    return boardEmails(db); // 팀장단 미배정 폴백
  }
  const [author] = await db.select({ email: users.email }).from(users).where(eq(users.id, post.authorUserId)).limit(1);
  return author ? [author.email] : [];
}

/**
 * 발행 D-3/D-1 미완성 예약을 점검하고 팀장단에게 알림. 중복 방지 + 요약 audit.
 */
export async function runReadinessCheck(db: Db, deps: ReadinessDeps = {}): Promise<ReadinessSummary> {
  const mailer = deps.mailer ?? dryMailer;
  const now = deps.now ?? new Date();
  const today = kstDate(now);
  const todayStr = fmt(today);

  // 미완성 = status='draft' 이고 publish_at 이 있는 예약.
  const drafts = await db
    .select()
    .from(scheduledPosts)
    .where(and(eq(scheduledPosts.status, 'draft'), isNotNull(scheduledPosts.publishAt)));

  const summary: ReadinessSummary = { checkedAt: now.toISOString(), incomplete: 0, alertsSent: 0, escalated: 0 };

  for (const post of drafts) {
    const daysUntil = daysBetween(kstDate(post.publishAt!), today);
    if (daysUntil !== 3 && daysUntil !== 1) continue; // D-3, D-1 만 알림
    summary.incomplete += 1;
    const escalate = daysUntil === 1;

    // 중복 방지: 오늘 이미 이 예약에 알림 보냈으면 skip.
    const inserted = await db
      .insert(noticeCheckLog)
      .values({ scheduledPostId: post.id, noticeDate: todayStr })
      .onConflictDoNothing()
      .returning({ id: noticeCheckLog.id });
    if (inserted.length === 0) continue;

    const to = await recipientsFor(db, post);
    if (to.length > 0) {
      const subject = escalate
        ? `[애니멀메이트] ⚠️ 내일 발행 예정 공지 미완성 — "${post.title}"`
        : `[애니멀메이트] 발행 D-3 공지 미완성 점검 — "${post.title}"`;
      const text = escalate
        ? `내일 발행 예정인 공지의 필수 필드(일시/장소/정원)가 아직 비어 있습니다. 완성하지 않으면 발행이 보류됩니다.\n예약: ${post.title}`
        : `3일 뒤 발행 예정인 공지의 필수 필드(일시/장소/정원)를 완성해 주세요.\n예약: ${post.title}`;
      await mailer.send({ to, subject, text });
      summary.alertsSent += 1;
      if (escalate) summary.escalated += 1;
    }
  }

  await recordAudit(
    db,
    buildAuditEntry({ actorUserId: null, action: 'cron.readiness_check', targetTable: 'scheduled_posts', targetId: null, after: summary })
  );
  return summary;
}
