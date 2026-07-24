// 챗봇 상태 tool — "다가오는 봉사"에는 **공지된 회차만** 나와야 한다.
// 회귀 방지: 초안(draft 예약글) 회차, 취소로 글만 지워진 고아 event 는 챗봇에 노출되면 안 된다.

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { events, scheduledPosts, boards, teams, users } from '@/db/schema';
import { listUpcomingSessions, getSessionsOnDate } from '@/rag/tools';

const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const suite = DIRECT_URL ? describe : describe.skip;

const MENUID = 990095;
const TEAM = 'TOOLTEST_봉사팀';
const EMAIL = 'tooltest@example.invalid';
const FUTURE = '2099-08-01'; // 먼 미래(다른 테스트 데이터와 안 겹치게)

suite('챗봇 봉사 tool — 공지된 회차만 노출', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let teamId: string;
  let userId: string;
  const eventIds: string[] = [];

  async function cleanup() {
    await db.delete(scheduledPosts).where(eq(scheduledPosts.boardMenuid, MENUID));
    const evs = await db.select({ id: events.id }).from(events).where(eq(events.eventDate, FUTURE));
    if (evs.length) await db.delete(events).where(inArray(events.id, evs.map((e) => e.id)));
    await db.delete(boards).where(eq(boards.menuid, MENUID));
    await db.delete(users).where(eq(users.email, EMAIL));
    const ts = await db.select({ id: teams.id }).from(teams).where(eq(teams.name, TEAM));
    if (ts.length) await db.delete(teams).where(inArray(teams.id, ts.map((t) => t.id)));
  }

  async function mkEvent(title: string, place: string): Promise<string> {
    const [ev] = await db.insert(events).values({ teamId, title, eventDate: FUTURE, place, capacity: 20, status: 'draft' }).returning();
    eventIds.push(ev!.id);
    return ev!.id;
  }
  async function mkPost(eventId: string, status: 'draft' | 'scheduled' | 'published') {
    await db.insert(scheduledPosts).values({
      ownerType: 'team', ownerId: teamId, authorUserId: userId, boardMenuid: MENUID,
      eventId, title: 't', contentMd: 'c', status, publishAt: new Date(),
    });
  }

  beforeAll(async () => {
    sql = postgres(DIRECT_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup();
    const [t] = await db.insert(teams).values({ name: TEAM, kind: 'activity' }).returning();
    teamId = t!.id;
    const [u] = await db.insert(users).values({ email: EMAIL, name: '툴' }).returning();
    userId = u!.id;
    await db.insert(boards).values({ menuid: MENUID, name: '툴테스트', botCanWrite: true });

    const published = await mkEvent('공지된 봉사', '보호소A');
    await mkPost(published, 'published');
    const scheduled = await mkEvent('예약대기 봉사', '보호소B');
    await mkPost(scheduled, 'scheduled');
    const draft = await mkEvent('초안 봉사', '보호소C');
    await mkPost(draft, 'draft'); // 아직 공지 안 됨
    await mkEvent('고아 봉사', '보호소D'); // 예약글 없음(취소로 삭제된 상태 재현)
  });

  afterAll(async () => {
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  it('공지된(published/scheduled) 회차만 나오고 초안·고아는 빠진다', async () => {
    const sessions = await listUpcomingSessions(db, { now: new Date('2099-07-01') });
    const places = sessions.map((s) => s.place);
    expect(places).toContain('보호소A'); // published
    expect(places).toContain('보호소B'); // scheduled
    expect(places).not.toContain('보호소C'); // draft 예약글 → 제외
    expect(places).not.toContain('보호소D'); // 고아 event → 제외
  });

  it('특정 날짜 조회도 공지된 것만', async () => {
    const sessions = await getSessionsOnDate(db, FUTURE);
    const places = sessions.map((s) => s.place);
    expect(places.sort()).toEqual(['보호소A', '보호소B']);
  });
});
