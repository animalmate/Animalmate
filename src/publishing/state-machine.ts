// 발행 상태머신 — 순수 로직(단위 테스트 필수: CLAUDE.md).
// post_status: draft → ready → scheduled → published | failed (03-DATA-MODEL).
//
// 핵심 규칙(결정 2026-07-23):
//  - 카페 code 999("연속으로 등록할 수 없습니다")는 **실패가 아니다**. failed 로 보내지 않고
//    scheduled 를 유지해 다음 사이클에 재시도한다(retry_count 증가 없음 = 대기 후 재시도).
//  - 그 외 오류(401/403/404 등)는 retry_count 증가. 재시도 2회를 넘기면(3번째 오류) failed.

import type { postStatusEnum } from '@/db/schema';

export type PostStatus = (typeof postStatusEnum.enumValues)[number]; // draft|ready|scheduled|published|failed

/** 재시도 최대 횟수(CLAUDE.md 규칙 #5). retry_count 가 이 값을 넘으면 failed. */
export const MAX_RETRIES = 2;

const ALLOWED: Record<PostStatus, PostStatus[]> = {
  draft: ['ready'],
  ready: ['scheduled', 'draft'],
  scheduled: ['published', 'failed', 'scheduled'], // scheduled→scheduled = 대기 후 재시도
  published: [],
  failed: ['scheduled'], // 운영진이 재시도 큐에 되돌릴 수 있음
};

export function canTransition(from: PostStatus, to: PostStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: PostStatus, to: PostStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`허용되지 않은 상태 전이: ${from} → ${to}`);
  }
}

/** 발행 시도 결과 분류. */
export type PublishResult =
  | { kind: 'success'; articleUrl: string }
  | { kind: 'rate_limited' } // code 999 — 실패 아님, 대기 후 재시도
  | { kind: 'error'; reason: string };

export interface PostState {
  status: PostStatus;
  retryCount: number;
}

export interface PostPatch {
  status: PostStatus;
  retryCount: number;
  cafeArticleUrl?: string | null;
  failReason?: string | null;
  /** true 면 이번 사이클엔 게시하지 않고 다음 사이클에 재시도(레이트리밋 백오프). */
  waitAndRetry?: boolean;
}

/**
 * 현재 상태 + 발행 결과 → 다음 상태 패치를 계산한다(순수).
 * scheduled 상태의 게시물에만 적용한다.
 */
export function nextStateForResult(current: PostState, result: PublishResult): PostPatch {
  switch (result.kind) {
    case 'success':
      return {
        status: 'published',
        retryCount: current.retryCount,
        cafeArticleUrl: result.articleUrl,
        failReason: null,
      };

    case 'rate_limited':
      // 실패로 세지 않는다. scheduled 유지, retry_count 불변, 다음 사이클 재시도.
      return {
        status: 'scheduled',
        retryCount: current.retryCount,
        waitAndRetry: true,
      };

    case 'error': {
      const retryCount = current.retryCount + 1;
      if (retryCount > MAX_RETRIES) {
        return { status: 'failed', retryCount, failReason: result.reason };
      }
      return { status: 'scheduled', retryCount, failReason: result.reason };
    }
  }
}

/** 카페 글쓰기 응답 → PublishResult 분류(code 999 = rate_limited). */
export function classifyPublishResponse(res: {
  ok: boolean;
  status: number;
  articleUrl?: string | null;
  raw?: unknown;
}): PublishResult {
  if (res.ok && res.articleUrl) return { kind: 'success', articleUrl: res.articleUrl };

  const err = extractError(res.raw);
  if (err.code === '999' || /연속으로 등록할 수 없/.test(err.message ?? '')) {
    return { kind: 'rate_limited' };
  }
  const reason =
    err.message != null
      ? `네이버: ${err.message}${err.code ? ` (code ${err.code})` : ''}`
      : `HTTP ${res.status}`;
  return { kind: 'error', reason };
}

function extractError(raw: unknown): { code?: string; message?: string } {
  if (raw && typeof raw === 'object') {
    const m = (raw as Record<string, unknown>).message;
    const err =
      m && typeof m === 'object' ? (m as Record<string, unknown>).error : (raw as Record<string, unknown>).error;
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      return { code: e.code as string | undefined, message: e.message as string | undefined };
    }
  }
  return {};
}
