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

  for (let i = 0; i < due.length; i++) {
    if (!dryRun && i > 0) await sleep(delayMs); // 연속 게시 방지 간격(실게시만)
    const post = due[i]!;
    const res = await write(post, { accessToken, dryRun });
    const result = classifyPublishResponse(res);
    await applyPublishResult(db, post, result);

    summary.processed += 1;
    if (result.kind === 'success') {
      summary.published += 1;
      summary.articleUrls.push(result.articleUrl);
    } else if (result.kind === 'rate_limited') {
      summary.waited += 1;
    } else {
      summary.failed += 1;
    }
  }

  await recordSummary(db, summary);
  return summary;
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
