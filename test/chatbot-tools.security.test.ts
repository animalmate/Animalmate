// 챗봇 상태 tool — "다가오는 봉사"는 취소 안 됐고 장소가 정해진 회차만 노출한다.
// (취소는 event.status=canceled 로, 미완성은 place=null 로 걸러진다. 발행 상태와는 무관 — 07-DECISIONS 24.)

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { events, teams, scheduledPosts, boards, users } from '@/db/schema';
import { listUpcomingSessions, getSessionsOnDate } from '@/rag/tools';
import { TEST_DATABASE_URL } from './db-url';

const suite = describe;

const TEAM = 'TOOLTEST_봉사팀';
const FUTURE = '2099-08-01'; // 먼 미래(다른 테스트 데이터와 안 겹치게)
const BOARD_MENUID = 990083;
const EMAIL = 'tooltest-author@example.invalid';

suite('챗봇 봉사 tool — 취소 아님 + 장소 있음만 노출', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let teamId: string;
  let authorUserId: string;

  async function cleanup() {
    // 예약글이 event 를 참조하므로 먼저 지운다(FK).
    await db.delete(scheduledPosts).where(eq(scheduledPosts.boardMenuid, BOARD_MENUID));
    await db.delete(boards).where(eq(boards.menuid, BOARD_MENUID));
    const evs = await db.select({ id: events.id }).from(events).where(eq(events.eventDate, FUTURE));
    if (evs.length) await db.delete(events).where(inArray(events.id, evs.map((e) => e.id)));
    const ts = await db.select({ id: teams.id }).from(teams).where(eq(teams.name, TEAM));
    if (ts.length) await db.delete(teams).where(inArray(teams.id, ts.map((t) => t.id)));
    await db.delete(users).where(eq(users.email, EMAIL));
  }

  async function mkEvent(title: string, place: string | null, status: 'draft' | 'published' | 'canceled') {
    await db.insert(events).values({ teamId, title, eventDate: FUTURE, place, capacity: 20, status });
  }

  beforeAll(async () => {
    sql = postgres(TEST_DATABASE_URL, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup();
    const [t] = await db.insert(teams).values({ name: TEAM, kind: 'activity' }).returning();
    teamId = t!.id;
    const [u] = await db.insert(users).values({ email: EMAIL, name: 'TOOLTEST 작성자' }).returning();
    authorUserId = u!.id;

    await mkEvent('초안이지만 장소 있는 봉사', '보호소A', 'draft'); // 발행 전이어도 장소 있으면 노출
    await mkEvent('발행된 봉사', '보호소B', 'published');
    await mkEvent('장소 미정 봉사', null, 'draft'); // 장소 없음 → 제외
    await mkEvent('취소된 봉사', '보호소D', 'canceled'); // 취소 → 제외
  });

  afterAll(async () => {
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  it('취소 아님 + 장소 있음만 나온다(초안이어도 장소 있으면 노출)', async () => {
    const places = (await listUpcomingSessions(db, { now: new Date('2099-07-01') })).map((s) => s.place);
    expect(places).toContain('보호소A'); // 초안이지만 장소 있음 → 노출(사용자 기대)
    expect(places).toContain('보호소B'); // 발행됨
    expect(places).not.toContain('보호소D'); // 취소 → 제외
    expect(places).not.toContain(null); // 장소 미정 → 제외
  });

  it('특정 날짜 조회도 같은 규칙', async () => {
    const places = (await getSessionsOnDate(db, FUTURE)).map((s) => s.place).sort();
    expect(places).toEqual(['보호소A', '보호소B']);
  });

  // 2026-07-31: "4팀 봉사공지 몇 시에 올라와?" 에 모델이 **집합 시각**으로 답했다.
  // tool 이 업로드 시각을 아예 몰랐기 때문이다 — 이제 연결된 예약글에서 가져온다.
  it('회차에 연결된 예약이 있으면 카페 업로드 시각을 함께 준다', async () => {
    const [ev] = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.eventDate, FUTURE), eq(events.place, '보호소A')));
    await db.insert(boards).values({ menuid: BOARD_MENUID, name: 'TOOLTEST 게시판', botCanWrite: true });
    await db.insert(scheduledPosts).values({
      title: 'TOOLTEST 공지',
      contentMd: '본문',
      boardMenuid: BOARD_MENUID,
      ownerType: 'team',
      ownerId: teamId,
      authorUserId,
      eventId: ev!.id,
      status: 'scheduled',
      publishAt: new Date('2099-07-25T06:00:00Z'), // KST 2099-07-25 15:00
    });

    const found = (await listUpcomingSessions(db, { now: new Date('2099-07-01') })).find((s) => s.place === '보호소A');
    expect(found!.upload).toEqual({ date: '2099-07-25', weekday: expect.any(String), time: '15:00', done: false });
    // 집합 시각과 섞이지 않는지 — 둘은 다른 값이다.
    expect(found!.meetTime).not.toBe('15:00');
  });

  it('연결된 예약이 없는 회차는 upload 가 null', async () => {
    const found = (await listUpcomingSessions(db, { now: new Date('2099-07-01') })).find((s) => s.place === '보호소B');
    expect(found!.upload).toBeNull();
  });
});
