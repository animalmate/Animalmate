import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { teams, users, boards, scheduledPosts, events } from '@/db/schema';
import { listReservations } from '@/publishing/reservations';
import type { Actor } from '@/auth/permissions';
import { TEST_DATABASE_URL } from './db-url';

const suite = describe;

const MENUID = 990081;
// 정렬 테스트 전용 게시판 — 다른 픽스처(발행 시각 NULL)와 섞이면 순서를 단언할 수 없다.
const MENUID2 = 990082;
const EMAIL = 'resv-scope-test@example.invalid';
const TEAM_A = 'RS-TEST-A팀';
const TEAM_B = 'RS-TEST-B팀';

suite('예약 큐 스코프 — 팀장은 자기 팀+개인만, 회장단은 전체', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let teamAId: string;
  let teamBId: string;
  let userId: string;
  const postIds: string[] = [];

  async function cleanup() {
    if (postIds.length) await db.delete(scheduledPosts).where(inArray(scheduledPosts.id, postIds));
    await db.delete(scheduledPosts).where(inArray(scheduledPosts.boardMenuid, [MENUID, MENUID2]));
    await db.delete(boards).where(inArray(boards.menuid, [MENUID, MENUID2]));
    await db.delete(users).where(eq(users.email, EMAIL));
    // events 는 teams 삭제 시 cascade 로 함께 지워진다(teamId onDelete: cascade).
    const ts = await db.select({ id: teams.id }).from(teams).where(inArray(teams.name, [TEAM_A, TEAM_B]));
    for (const t of ts) await db.delete(teams).where(eq(teams.id, t.id));
  }

  beforeAll(async () => {
    sql = postgres(TEST_DATABASE_URL, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup();
    const [a] = await db.insert(teams).values({ name: TEAM_A, kind: 'activity' }).returning();
    const [b] = await db.insert(teams).values({ name: TEAM_B, kind: 'activity' }).returning();
    teamAId = a!.id;
    teamBId = b!.id;
    const [u] = await db.insert(users).values({ email: EMAIL, name: '스코프' }).returning();
    userId = u!.id;
    await db.insert(boards).values([
      { menuid: MENUID, name: '스코프 테스트', botCanWrite: true },
      { menuid: MENUID2, name: '정렬 테스트', botCanWrite: true },
    ]);

    const seed = async (ownerType: 'team' | 'personal', ownerId: string, title: string, eventId: string | null = null) => {
      const [p] = await db
        .insert(scheduledPosts)
        .values({ ownerType, ownerId, authorUserId: userId, boardMenuid: MENUID, title, contentMd: '내용', status: 'draft', eventId })
        .returning();
      postIds.push(p!.id);
      return p!.id;
    };
    // 일반 공지 = event 없음, 봉사 공지 = event 있음(생성 경로에서 그렇게 갈린다).
    const mkEvent = async (teamId: string, title: string) => {
      const [e] = await db.insert(events).values({ teamId, title, eventDate: '2026-08-01' }).returning();
      return e!.id;
    };
    await seed('team', teamAId, 'A팀 예약');
    await seed('personal', userId, '내 개인 예약');
    await seed('team', teamBId, 'B팀 예약');
    await seed('team', teamAId, 'A팀 봉사', await mkEvent(teamAId, 'A팀 회차'));
    await seed('team', teamBId, 'B팀 봉사', await mkEvent(teamBId, 'B팀 회차'));
  });

  afterAll(async () => {
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  const titles = (rows: { title: string }[]) => rows.map((r) => r.title).sort();

  // 2026-07-31 사용자 지적: 큐는 "동아리가 언제 무엇을 올리는지" 한자리에서 보는 화면이라
  // 운영진이 남의 팀 예약을 못 보면 겹치는 공지·빠진 공지를 아무도 미리 알아챌 수 없다.
  // 보는 범위만 넓히고 고치는 범위는 그대로다(아래 '고치는 범위' 테스트).
  const ALL = ['A팀 봉사', 'A팀 예약', 'B팀 봉사', 'B팀 예약', '내 개인 예약'];

  it('팀A 팀장: 팀과 무관하게 전체를 본다', async () => {
    const actor: Actor = { userId, role: 'staff', membershipActive: true, teams: [{ teamId: teamAId, position: 'leader' }] };
    const rows = (await listReservations(db, { actor })).filter((r) => r.boardMenuid === MENUID);
    expect(titles(rows)).toEqual(ALL);
  });

  it('팀B 팀장(다른 사용자): 소속과 무관하게 전체를 본다', async () => {
    const actor: Actor = { userId: crypto.randomUUID(), role: 'staff', membershipActive: true, teams: [{ teamId: teamBId, position: 'leader' }] };
    const rows = (await listReservations(db, { actor })).filter((r) => r.boardMenuid === MENUID);
    expect(titles(rows)).toEqual(ALL);
  });

  it('팀이 없는 운영진도 전체를 본다', async () => {
    const actor: Actor = { userId: crypto.randomUUID(), role: 'staff', membershipActive: true, teams: [] };
    const rows = (await listReservations(db, { actor })).filter((r) => r.boardMenuid === MENUID);
    expect(titles(rows)).toEqual(ALL);
  });

  it('회장단: 전체', async () => {
    const actor: Actor = { userId: crypto.randomUUID(), role: 'board', membershipActive: true, teams: [] };
    const rows = (await listReservations(db, { actor })).filter((r) => r.boardMenuid === MENUID);
    expect(titles(rows)).toEqual(['A팀 봉사', 'A팀 예약', 'B팀 봉사', 'B팀 예약', '내 개인 예약']);
  });

  // ── 큐 종류 필터(일반 공지 / 봉사 공지 팀별) ────────────────────────────
  const board: Actor = { userId: '00000000-0000-0000-0000-000000000000', role: 'board', membershipActive: true, teams: [] };

  // ── 단톡 공지문 재료(팀 이름·게시판 주소) ────────────────────────────────
  // teams 조인은 owner_id 가 FK 없는 다형성 컬럼이라 owner_type 까지 봐야 한다.
  // 잘못 걸면 개인 소유 건에 남의 팀 이름이 붙거나 행이 불어난다 — 그래서 건수도 함께 본다.
  it('팀 소유 예약에는 팀 이름이, 개인 소유에는 null 이 붙는다', async () => {
    const rows = (await listReservations(db, { actor: board })).filter((r) => r.boardMenuid === MENUID);
    expect(rows).toHaveLength(5); // 조인 때문에 행이 늘지 않았는지.
    const byTitle = new Map(rows.map((r) => [r.title, r]));
    expect(byTitle.get('A팀 예약')!.teamName).toBe(TEAM_A);
    expect(byTitle.get('B팀 봉사')!.teamName).toBe(TEAM_B);
    expect(byTitle.get('내 개인 예약')!.teamName).toBeNull();
  });

  it('게시판 주소는 clubid + menuid 로 조립된다', async () => {
    const prev = process.env.NAVER_CAFE_CLUB_ID;
    process.env.NAVER_CAFE_CLUB_ID = '12345';
    try {
      const [row] = (await listReservations(db, { actor: board })).filter((r) => r.boardMenuid === MENUID);
      expect(row!.boardUrl).toBe(`https://cafe.naver.com/f-e/cafes/12345/menus/${MENUID}`);
    } finally {
      process.env.NAVER_CAFE_CLUB_ID = prev;
    }
  });

  it("kind='general': 회차 없는 건만", async () => {
    const rows = (await listReservations(db, { actor: board, kind: 'general' })).filter((r) => r.boardMenuid === MENUID);
    expect(titles(rows)).toEqual(['A팀 예약', 'B팀 예약', '내 개인 예약']);
  });

  it("kind='volunteer': 회차 있는 건만", async () => {
    const rows = (await listReservations(db, { actor: board, kind: 'volunteer' })).filter((r) => r.boardMenuid === MENUID);
    expect(titles(rows)).toEqual(['A팀 봉사', 'B팀 봉사']);
  });

  it('teamId 로 팀별 봉사 공지만 본다', async () => {
    const rows = (await listReservations(db, { actor: board, kind: 'volunteer', teamId: teamAId })).filter(
      (r) => r.boardMenuid === MENUID
    );
    expect(titles(rows)).toEqual(['A팀 봉사']);
  });

  it('팀A 팀장이 B팀으로 걸러 보는 것도 된다(보는 범위가 전체이므로)', async () => {
    const actor: Actor = { userId, role: 'staff', membershipActive: true, teams: [{ teamId: teamAId, position: 'leader' }] };
    const rows = (await listReservations(db, { actor, teamId: teamBId })).filter((r) => r.boardMenuid === MENUID);
    expect(titles(rows)).toEqual(['B팀 봉사', 'B팀 예약']);
  });

  // 넓힌 것은 **운영진 이상**뿐이다. 부원이 들어와도 남의 것은 안 보이고, 필터로도 넓힐 수 없다.
  // (라우트가 이미 staff+ 로 막지만, 스코프 자체가 방어선이어야 한다.)
  it('부원은 본인 개인 것만 — teamId 를 지정해도 넓어지지 않는다', async () => {
    const actor: Actor = { userId, role: 'member', membershipActive: true, teams: [] };
    const mine = (await listReservations(db, { actor })).filter((r) => r.boardMenuid === MENUID);
    expect(titles(mine)).toEqual(['내 개인 예약']);

    const filtered = (await listReservations(db, { actor, teamId: teamBId })).filter((r) => r.boardMenuid === MENUID);
    expect(filtered).toHaveLength(0);
  });

  // 2026-07-29 QA: publish_at 오름차순이라 이미 업로드된 글이 맨 위를 차지했고, 새로 만든 예약을
  // 보려면 끝까지 스크롤해야 했다. 큐 위쪽은 앞으로 할 일이어야 한다.
  it('정렬: 미발행(임박 순) → 발행 완료(최근 순), 시각 미정은 미발행 맨 뒤', async () => {
    const at = (iso: string | null) => (iso ? new Date(iso) : null);
    const seedAt = async (title: string, publishAt: string | null, status: 'scheduled' | 'published') => {
      const [p] = await db
        .insert(scheduledPosts)
        .values({
          ownerType: 'personal',
          ownerId: userId,
          authorUserId: userId,
          boardMenuid: MENUID2,
          title,
          contentMd: '내용',
          status,
          publishAt: at(publishAt),
        })
        .returning();
      postIds.push(p!.id);
    };
    await seedAt('발행완료 오래된', '2026-07-01T00:00:00Z', 'published');
    await seedAt('발행완료 최근', '2026-07-20T00:00:00Z', 'published');
    await seedAt('예정 나중', '2026-09-01T00:00:00Z', 'scheduled');
    await seedAt('예정 임박', '2026-08-01T00:00:00Z', 'scheduled');
    await seedAt('시각 미정', null, 'scheduled');

    const rows = (await listReservations(db, { actor: board })).filter((r) => r.boardMenuid === MENUID2);
    expect(rows.map((r) => r.title)).toEqual([
      '예정 임박',
      '예정 나중',
      '시각 미정',
      '발행완료 최근',
      '발행완료 오래된',
    ]);
  });
});
