// 발행 워커 — due 예약 글을 카페에 게시하고 상태를 반영한다. pg_cron(매분) → /api/cron/publish 가 호출.
//
// 규칙:
//  - 한 사이클 소량(≤5건)만 처리(함수 타임아웃 회피, 02-TECH-STACK §3).
//  - 실제 게시 시 건별 지연(기본 30초)으로 code 999(연속 게시 방지) 회피. code 999 는 실패가 아니라
//    대기 후 재시도(state-machine). dryRun 이면 네트워크·지연 없음.
//  - 처리 요약을 반환하고 audit_logs 에도 남긴다(크론 관제 로그).

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@/db/schema';
import { fetchDuePosts, applyPublishResult, type ScheduledPost } from './scheduled-posts';
import { classifyPublishResponse } from './state-machine';
import { postArticle, type CafeWriteResult } from '@/naver/cafe-write';
import { buildAuditEntry, recordAudit } from '@/auth/audit';
import type { Mailer } from '@/auth/mailer';
import { defaultMailer } from '@/auth/mailer';
import { boardEmails } from '@/auth/operators';

type DB = PostgresJsDatabase<typeof schema>;

export interface PublishSummary {
  startedAt: string;
  dryRun: boolean;
  processed: number;
  published: number;
  waited: number; // code 999 rate_limited — 대기 후 재시도
  failed: number;
  articleUrls: string[];
}

export interface WorkerDeps {
  /** 기본: env NAVER_PUBLISH_DRY_RUN !== 'false' (즉 기본 dryRun=true). */
  dryRun?: boolean;
  limit?: number; // 기본 5
  delayMs?: number; // 실게시 건별 간격(기본 30000). dryRun 이면 미적용.
  now?: Date;
  clubId?: string; // 기본 env NAVER_CAFE_CLUB_ID
  /** 테스트 주입: 카페 쓰기. 기본은 postArticle(dryRun 반영). */
  cafeWrite?: (post: ScheduledPost, ctx: { accessToken: string; dryRun: boolean }) => Promise<CafeWriteResult>;
  /** 실게시 시 access token 공급(기본: naver_tokens 갱신). dryRun 이면 호출 안 함. */
  accessTokenProvider?: () => Promise<string>;
  sleep?: (ms: number) => Promise<void>;
  /** 발행 실패 알림 메일러(기본: defaultMailer — SMTP 미설정이면 dry). */
  mailer?: Mailer;
  /** 실패 알림 수신자(기본: 활성 회장단·시스템관리자 이메일). */
  alertEmails?: () => Promise<string[]>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runPublishWorker(db: DB, deps: WorkerDeps = {}): Promise<PublishSummary> {
  const dryRun = deps.dryRun ?? process.env.NAVER_PUBLISH_DRY_RUN !== 'false';
  const limit = Math.min(deps.limit ?? 5, 5);
  const delayMs = deps.delayMs ?? 30_000;
  const now = deps.now ?? new Date();
  const clubId = deps.clubId ?? process.env.NAVER_CAFE_CLUB_ID ?? '';
  const sleep = deps.sleep ?? defaultSleep;

  const summary: PublishSummary = {
    startedAt: now.toISOString(),
    dryRun,
    processed: 0,
    published: 0,
    waited: 0,
    failed: 0,
    articleUrls: [],
  };

  const due = await fetchDuePosts(db, now, limit);
  if (due.length === 0) {
    await recordSummary(db, summary);
    return summary;
  }

  // 실게시일 때만 access token 확보(dryRun 은 토큰 불필요).
  let accessToken = 'dry-run';
  if (!dryRun) {
    const provider = deps.accessTokenProvider ?? (() => defaultAccessToken(db));
    accessToken = await provider();
  }

  const write =
    deps.cafeWrite ??
    ((post: ScheduledPost, ctx: { accessToken: string; dryRun: boolean }) =>
      postArticle(
        { accessToken: ctx.accessToken, clubId, menuId: post.boardMenuid, subject: post.title, content: post.contentMd },
        { dryRun: ctx.dryRun }
      ));

  // 이번 사이클에 최종 실패(failed)로 확정된 예약 — 재시도 소진분만 알림 대상.
  const failedNow: { title: string; reason: string }[] = [];

  for (let i = 0; i < due.length; i++) {
    if (!dryRun && i > 0) await sleep(delayMs); // 연속 게시 방지 간격(실게시만)
    const post = due[i]!;
    const res = await write(post, { accessToken, dryRun });
    const result = classifyPublishResponse(res);
    const updated = await applyPublishResult(db, post, result);

    summary.processed += 1;
    if (result.kind === 'success') {
      summary.published += 1;
      summary.articleUrls.push(result.articleUrl);
    } else if (result.kind === 'rate_limited') {
      summary.waited += 1;
    } else {
      summary.failed += 1;
      // status 가 실제로 failed 로 전이됐을 때만 알림(재시도 소진). 재시도 여지가 남으면 조용히 다음 사이클.
      if (updated.status === 'failed') {
        failedNow.push({ title: post.title, reason: updated.failReason ?? result.reason });
      }
    }
  }

  if (failedNow.length > 0) await sendFailureAlert(db, failedNow, deps);

  await recordSummary(db, summary);
  return summary;
}

// 발행 최종 실패 알림 — 운영진에게 1건으로 묶어 발송(규칙 #5: 실패를 조용히 삼키지 않는다).
async function sendFailureAlert(db: DB, failed: { title: string; reason: string }[], deps: WorkerDeps): Promise<void> {
  try {
    const to = deps.alertEmails ? await deps.alertEmails() : await boardEmails(db);
    if (to.length === 0) return;
    const mailer = deps.mailer ?? defaultMailer();
    const lines = failed.map((f) => `• "${f.title}" — ${f.reason}`).join('\n');
    await mailer.send({
      to,
      subject: `[애니멀메이트] ⚠️ 공지 발행 실패 ${failed.length}건`,
      text:
        `아래 예약 공지가 재시도 후에도 발행에 실패했습니다. 예약 큐에서 확인해 주세요.\n\n${lines}\n\n` +
        `※ 발행된 글은 카페에서 수정할 수 없으니, 실패 건은 원인 확인 후 예약 큐에서 재시도(발행 대기)하세요.`,
    });
  } catch (e) {
    // 알림 실패가 워커 전체를 막지 않도록: audit 에만 남긴다.
    await recordAudit(
      db,
      buildAuditEntry({
        actorUserId: null,
        action: 'cron.publish.alert_failed',
        targetTable: 'scheduled_posts',
        targetId: null,
        after: { error: e instanceof Error ? e.message : String(e), failedCount: failed.length },
      })
    );
  }
}

// 요약을 audit_logs 에 기록(크론 관제). 시스템 행위이므로 actor 는 null.
async function recordSummary(db: DB, summary: PublishSummary): Promise<void> {
  await recordAudit(
    db,
    buildAuditEntry({
      actorUserId: null,
      action: 'cron.publish',
      targetTable: 'scheduled_posts',
      targetId: null,
      after: summary,
    })
  );
}

async function defaultAccessToken(db: DB): Promise<string> {
  const { refreshAndStore } = await import('@/naver/token-service');
  const { loadKeyFromEnv } = await import('@/crypto/token-cipher');
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('NAVER_CLIENT_ID/SECRET 가 필요합니다(실게시).');
  const tok = await refreshAndStore(db, { key: loadKeyFromEnv(), clientId, clientSecret });
  return tok.accessToken;
}
