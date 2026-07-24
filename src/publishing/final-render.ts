// 발행 직전 최종 치환 — {{장소}}{{정원}} 등 회차별로 바뀌는 값을 게시 직전에 채운다.
//
// 결정(2026-07-24): 장소·정원의 **유일한 값 저장소는 events**(예약 수정 화면의 장소/정원 칸).
// 본문에는 {{장소}}{{정원}} 을 그대로 남겨두고 발행 워커가 이 모듈로 치환하므로,
// 회차별 수정이 본문 텍스트와 어긋날 수 없다(발행 후에는 카페 글 수정 API 가 없어 되돌릴 수 없음).
// 템플릿의 기본 장소·정원은 예약 생성 시 events 에 복사되어 여기서 자연히 반영된다.

import { eq } from 'drizzle-orm';
import { events, teams } from '@/db/schema';
import type { Database } from '@/db/types';
import { dateVars, leadersBlock } from './placeholders';
import { renderTemplate, unresolvedKeys } from './template-render';

type EventRow = typeof events.$inferSelect;

export interface RenderedPost {
  title: string;
  contentMd: string;
  /** 값이 없어 치환되지 못한 키. 비어 있지 않으면 발행하면 안 된다(빈 공지 방지 — CLAUDE.md 규칙 #6). */
  unresolved: string[];
}

/** 회차(event) + 팀장단 명단 → 최종 치환 변수. 값이 빈 키는 넣지 않아 미치환으로 남긴다. */
export function publishVars(event: EventRow | null, leaders: string): Record<string, string> {
  const vars: Record<string, string> = {};
  if (event) {
    Object.assign(vars, dateVars(event.eventDate));
    if (event.meetTime) vars['집합시간'] = event.meetTime.slice(0, 5);
    if (event.place?.trim()) vars['장소'] = event.place.trim();
    if (event.capacity != null) vars['정원'] = String(event.capacity);
  }
  if (leaders) vars['팀장단'] = leaders;
  return vars;
}

/** 제목·본문에 변수를 적용하고 남은 미치환 키를 함께 돌려준다(순수). */
export function renderFinal(post: { title: string; contentMd: string }, vars: Record<string, string>): RenderedPost {
  const title = renderTemplate(post.title, vars);
  const contentMd = renderTemplate(post.contentMd, vars);
  return { title, contentMd, unresolved: unresolvedKeys(title, contentMd) };
}

/** 예약 글의 최종 치환 변수를 DB 에서 모은다(연결된 event + 팀 소유면 팀장단 명단). */
export async function loadPublishVars(
  db: Database,
  post: { ownerType: string; ownerId: string; eventId: string | null }
): Promise<Record<string, string>> {
  let event: EventRow | null = null;
  if (post.eventId) {
    const [row] = await db.select().from(events).where(eq(events.id, post.eventId)).limit(1);
    event = row ?? null;
  }
  let leaders = '';
  if (post.ownerType === 'team') {
    const [team] = await db.select({ leaders: teams.leaders }).from(teams).where(eq(teams.id, post.ownerId)).limit(1);
    leaders = leadersBlock(team?.leaders);
  }
  return publishVars(event, leaders);
}

/** 예약 글 → 카페에 실제로 나갈 최종 제목·본문. 발행 워커와 수정 화면 미리보기가 함께 쓴다. */
export async function renderForPublish(
  db: Database,
  post: { ownerType: string; ownerId: string; eventId: string | null; title: string; contentMd: string }
): Promise<RenderedPost> {
  return renderFinal(post, await loadPublishVars(db, post));
}
