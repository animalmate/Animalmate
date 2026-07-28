import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { teams, users, boards, scheduledPosts, events, postTemplates, auditLogs } from '@/db/schema';
import { createReservation, createReservationsMulti, SlotTakenError } from '@/publishing/reservations';
import { cancelPost } from '@/publishing/scheduled-posts';
import { createTemplate } from '@/publishing/post-templates';
import { PermissionError } from '@/auth/guard';
import type { Actor } from '@/auth/permissions';
import { TEST_DATABASE_URL } from './db-url';

const suite = describe;

const MENUID = 990082;
const EMAIL = 'resv-create-test@example.invalid';
const TEAM_A = 'RC-TEST-A팀';
const TEAM_B = 'RC-TEST-B팀';

suite('봉사(팀) 예약 생성 권한 — 팀장은 자기 팀만, 회장단은 전 팀', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let teamAId: string;
  let teamBId: string;
  let userId: string;
  const createdPosts: string[] = [];

  async function cleanup() {
    await db.delete(scheduledPosts).where(eq(scheduledPosts.boardMenuid, MENUID));
    if (teamAId) await db.delete(postTemplates).where(eq(postTemplates.ownerId, teamAId));
    const evs = await db.select({ id: events.id }).from(events).where(inArray(events.teamId, [teamAId, teamBId].filter(Boolean) as string[]));
    for (const e of evs) await db.delete(events).where(eq(events.id, e.id));
    await db.delete(boards).where(eq(boards.menuid, MENUID));
    await db.delete(users).where(eq(users.email, EMAIL));
    const ts = await db.select({ id: teams.id }).from(teams).where(inArray(teams.name, [TEAM_A, TEAM_B]));
    for (const t of ts) await db.delete(teams).where(eq(teams.id, t.id));
  }

  beforeAll(async () => {
    sql = postgres(TEST_DATABASE_URL, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    // 이전 크래시 잔여 데이터 방지(멱등).
    await db.delete(scheduledPosts).where(eq(scheduledPosts.boardMenuid, MENUID));
    await db.delete(boards).where(eq(boards.menuid, MENUID));
    await db.delete(users).where(eq(users.email, EMAIL));
    const oldTeams = await db.select({ id: teams.id }).from(teams).where(inArray(teams.name, [TEAM_A, TEAM_B]));
    for (const t of oldTeams) await db.delete(teams).where(eq(teams.id, t.id));
    const [a] = await db.insert(teams).values({ name: TEAM_A, kind: 'activity' }).returning();
    const [b] = await db.insert(teams).values({ name: TEAM_B, kind: 'activity' }).returning();
    teamAId = a!.id;
    teamBId = b!.id;
    const [u] = await db.insert(users).values({ email: EMAIL, name: '생성테스트' }).returning();
    userId = u!.id;
    await db.insert(boards).values({ menuid: MENUID, name: '생성 테스트', botCanWrite: true });
  });

  afterAll(async () => {
    if (createdPosts.length) await db.delete(auditLogs).where(inArray(auditLogs.targetId, createdPosts));
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  const leaderOfA: () => Actor = () => ({ userId, role: 'staff', membershipActive: true, teams: [{ teamId: teamAId, position: 'leader' }] });
  const board: () => Actor = () => ({ userId, role: 'board', membershipActive: true, teams: [] });
  const vol = (teamId: string) => ({ kind: 'volunteer' as const, teamId, boardMenuid: MENUID, title: '봉사', contentMd: '내용' });

  it('팀A 팀장: 팀A 예약 생성 성공', async () => {
    const post = await createReservation(db, leaderOfA(), vol(teamAId));
    createdPosts.push(post.id);
    expect(post.ownerType).toBe('team');
    expect(post.ownerId).toBe(teamAId);
  });

  it('팀A 팀장: 팀B 예약 생성 거부(not_owner)', async () => {
    await expect(createReservation(db, leaderOfA(), vol(teamBId))).rejects.toBeInstanceOf(PermissionError);
  });

  it('회장단: 팀B 예약도 생성 성공(override)', async () => {
    const post = await createReservation(db, board(), vol(teamBId));
    createdPosts.push(post.id);
    expect(post.ownerId).toBe(teamBId);
  });

  it('회차별 정원: 지정한 건은 그 값, 비운 건은 양식의 기본 정원', async () => {
    const tpl = await createTemplate(db, leaderOfA(), {
      ownerType: 'team',
      ownerId: teamAId,
      name: 'RC 정원 양식',
      titleTemplate: '{{간결_날짜}} 봉사',
      bodyTemplate: '정원 {{정원}} / 장소 {{장소}}',
      defaultPlace: '양주 쉼터',
      defaultCapacity: 20,
    });
    const { ids } = await createReservationsMulti(
      db,
      leaderOfA(),
      { kind: 'volunteer', teamId: teamAId, boardMenuid: MENUID, title: '{{간결_날짜}} 봉사', contentMd: '정원 {{정원}}', templateId: tpl.id },
      [
        { publishAt: new Date('2026-09-01T11:00:00Z'), eventDate: '2026-09-08', meetTime: '10:00', capacity: 35 },
        { publishAt: new Date('2026-10-01T11:00:00Z'), eventDate: '2026-10-13', meetTime: '10:00' }, // 비움 → 기본값
      ]
    );
    createdPosts.push(...ids);
    expect(ids).toHaveLength(2);

    const rows = await db
      .select({ postId: scheduledPosts.id, capacity: events.capacity, place: events.place })
      .from(scheduledPosts)
      .innerJoin(events, eq(events.id, scheduledPosts.eventId))
      .where(inArray(scheduledPosts.id, ids));
    const byId = new Map(rows.map((r) => [r.postId, r]));
    expect(byId.get(ids[0]!)!.capacity).toBe(35); // 회차별 지정이 우선
    expect(byId.get(ids[1]!)!.capacity).toBe(20); // 양식 기본값
    expect(byId.get(ids[0]!)!.place).toBe('양주 쉼터'); // 장소는 양식 기본값
  });

  it('소속 팀 없는 운영진: 봉사 예약 생성 거부', async () => {
    const staffNoTeam: Actor = { userId, role: 'staff', membershipActive: true, teams: [] };
    await expect(createReservation(db, staffNoTeam, vol(teamAId))).rejects.toBeInstanceOf(PermissionError);
  });

  // 07-DECISIONS 20: 예약 취소 시 고아 event 를 남기지 않는다(챗봇 봉사 목록 누출 방지).
  it('봉사 예약 취소: 예약글 삭제 + 연결 event 도 canceled 로 전이(고아 방지)', async () => {
    const post = await createReservation(db, board(), vol(teamAId));
    createdPosts.push(post.id);
    const eventId = post.eventId!;
    expect(eventId).toBeTruthy();

    await cancelPost(db, board(), post.id);

    // 예약글은 사라지고, event 는 남되 status=canceled.
    const [gonePost] = await db.select({ id: scheduledPosts.id }).from(scheduledPosts).where(eq(scheduledPosts.id, post.id));
    expect(gonePost).toBeUndefined();
    const [ev] = await db.select({ status: events.status }).from(events).where(eq(events.id, eventId));
    expect(ev!.status).toBe('canceled');
  });
  // 팀별 발행 시각이 30분 간격으로 정해져 있어, 같은 분에 두 건이 잡히면 슬롯 중복 예약이다.
  // (이 검사는 발행 워커의 점유를 대신하지 않는다 — 발행 시점 겹침은 점유가 막는다.)
  describe('같은 시각 중복 예약', () => {
    const at = (iso: string) => ({ ...vol(teamAId), publishAt: new Date(iso) });

    it('같은 분에 두 번째 예약을 만들 수 없다', async () => {
      const first = await createReservation(db, board(), at('2027-03-01T05:00:00Z'));
      createdPosts.push(first.id);

      await expect(createReservation(db, board(), at('2027-03-01T05:00:30Z'))).rejects.toBeInstanceOf(SlotTakenError);
    });

    it('1분만 떨어져 있으면 만들 수 있다 — 번개·일반 공지가 사이에 들어갈 수 있어야 한다', async () => {
      const second = await createReservation(db, board(), at('2027-03-01T05:01:00Z'));
      createdPosts.push(second.id);
      expect(second.id).toBeTruthy();
    });

    it('반복 예약은 겹친 회차만 빼고 나머지를 만든다', async () => {
      const res = await createReservationsMulti(
        db,
        board(),
        { kind: 'volunteer', teamId: teamAId, boardMenuid: MENUID, title: '봉사', contentMd: '내용' },
        [
          { publishAt: new Date('2027-03-01T05:00:00Z'), eventDate: '2027-03-08' }, // 위에서 이미 잡힌 시각
          { publishAt: new Date('2027-03-08T05:00:00Z'), eventDate: '2027-03-15' },
        ]
      );
      createdPosts.push(...res.ids);
      expect(res.ids).toHaveLength(1);
      expect(res.skipped).toHaveLength(1);
      expect(res.skipped[0]!.conflictTitle).toBeTruthy();
    });

    it('한 요청 안에서 같은 시각이 두 번 나와도 하나만 만든다', async () => {
      const res = await createReservationsMulti(
        db,
        board(),
        { kind: 'volunteer', teamId: teamAId, boardMenuid: MENUID, title: '봉사', contentMd: '내용' },
        [
          { publishAt: new Date('2027-04-05T05:00:00Z'), eventDate: '2027-04-12' },
          { publishAt: new Date('2027-04-05T05:00:00Z'), eventDate: '2027-04-19' },
        ]
      );
      createdPosts.push(...res.ids);
      expect(res.ids).toHaveLength(1);
      expect(res.skipped).toHaveLength(1);
    });
  });
});