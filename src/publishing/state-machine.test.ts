import { describe, it, expect } from 'vitest';
import {
  canTransition,
  assertTransition,
  nextStateForResult,
  classifyPublishResponse,
  MAX_RETRIES,
  type PostState,
} from './state-machine';

describe('상태 전이 규칙', () => {
  it('허용 전이', () => {
    expect(canTransition('draft', 'ready')).toBe(true);
    expect(canTransition('ready', 'scheduled')).toBe(true);
    expect(canTransition('scheduled', 'published')).toBe(true);
    expect(canTransition('scheduled', 'failed')).toBe(true);
    expect(canTransition('scheduled', 'scheduled')).toBe(true); // 대기 후 재시도
  });

  it('금지 전이', () => {
    expect(canTransition('draft', 'published')).toBe(false);
    expect(canTransition('published', 'scheduled')).toBe(false);
    expect(() => assertTransition('draft', 'published')).toThrow();
  });
});

describe('발행 결과 → 다음 상태', () => {
  const scheduled: PostState = { status: 'scheduled', retryCount: 0 };

  it('성공 → published + 글 URL, retry_count 불변', () => {
    const patch = nextStateForResult(scheduled, { kind: 'success', articleUrl: 'https://cafe/1' });
    expect(patch).toMatchObject({ status: 'published', cafeArticleUrl: 'https://cafe/1', retryCount: 0 });
  });

  // 핵심 DoD: code 999 는 failed 가 아니라 대기 후 재시도.
  it('rate_limited(code 999) → failed 아님, scheduled 유지 + waitAndRetry, retry_count 증가 없음', () => {
    const patch = nextStateForResult({ status: 'scheduled', retryCount: 1 }, { kind: 'rate_limited' });
    expect(patch.status).toBe('scheduled');
    expect(patch.status).not.toBe('failed');
    expect(patch.waitAndRetry).toBe(true);
    expect(patch.retryCount).toBe(1); // 불변
  });

  it('error → retry_count 증가, 2회까지는 scheduled 유지', () => {
    const first = nextStateForResult({ status: 'scheduled', retryCount: 0 }, { kind: 'error', reason: '401' });
    expect(first).toMatchObject({ status: 'scheduled', retryCount: 1 });
    const second = nextStateForResult({ status: 'scheduled', retryCount: 1 }, { kind: 'error', reason: '401' });
    expect(second).toMatchObject({ status: 'scheduled', retryCount: 2 });
  });

  it('error 가 재시도 한도를 넘으면 failed + 사유', () => {
    const patch = nextStateForResult(
      { status: 'scheduled', retryCount: MAX_RETRIES },
      { kind: 'error', reason: '403 등급 부족' }
    );
    expect(patch).toMatchObject({ status: 'failed', retryCount: MAX_RETRIES + 1, failReason: '403 등급 부족' });
  });

  it('여러 번의 rate_limited 는 영원히 failed 로 가지 않는다(도배 방지 백오프)', () => {
    let st: PostState = { status: 'scheduled', retryCount: 0 };
    for (let i = 0; i < 5; i++) {
      const patch = nextStateForResult(st, { kind: 'rate_limited' });
      expect(patch.status).toBe('scheduled');
      st = { status: patch.status, retryCount: patch.retryCount };
    }
    expect(st.retryCount).toBe(0);
  });
});

describe('카페 응답 분류', () => {
  it('성공 응답 → success', () => {
    expect(classifyPublishResponse({ ok: true, status: 200, articleUrl: 'https://cafe/9' })).toEqual({
      kind: 'success',
      articleUrl: 'https://cafe/9',
    });
  });

  it('code 999 → rate_limited', () => {
    const raw = { message: { error: { code: '999', message: '게시글을 연속으로 등록할 수 없습니다.' } } };
    expect(classifyPublishResponse({ ok: false, status: 403, raw }).kind).toBe('rate_limited');
  });

  it('AP003(등급 부족) → error', () => {
    const raw = { message: { error: { code: 'AP003', message: '카페스탭 등급이 되시면 쓰기가 가능한 게시판 입니다.' } } };
    const r = classifyPublishResponse({ ok: false, status: 403, raw });
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.reason).toContain('AP003');
  });
});
