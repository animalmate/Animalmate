import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { boards, users, teams, teamMembers, memberships, scheduledPosts, events, postTemplates, noticeCheckLog, auditLogs } from '@/db/schema';
import { createTemplate } from '@/publishing/post-templates';
import { batchGenerate, type BatchPreset } from '@/publishing/batch-generate';
import { renderForPublish } from '@/publishing/final-render';
import { runReadinessCheck } from '@/publishing/readiness-check';
import { createDraft } from '@/publishing/scheduled-posts';
import { PermissionError } from '@/auth/guard';
import type { Actor } from '@/auth/permissions';
import type { Mailer, GenericMail } from '@/auth/mailer';

const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const suite = DIRECT_URL ? describe : describe.skip;

const MENUID = 990072;
const LEADER_EMAIL = 'f1-leader@example.invalid';
const BOARD_EMAIL = 'f1-board@example.invalid';
const TEAM_NAME = 'F1테스트팀_zzz';
const NOLEADER_TEAM = 'F1무팀장팀_zzz';

function captureMailer(): { mailer: Mailer; sent: GenericMail[] } {
  const sent: GenericMail[] = [];
  return { mailer: { async send(m) { sent.push(m); }, async sendOtp() {} }, sent };
}

suite('F1 — 템플릿 / 일괄 생성 / 미완성 점검', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let board: Actor;
  let leader: Actor;
  let teamId: string;
  let templateId: string;

  async function cleanup() {
    await db.delete(scheduledPosts).where(eq(scheduledPosts.boardMenuid, MENUID)); // cascades notice_check_log
    if (teamId) {
      await db.delete(events).where(eq(events.teamId, teamId));
      await db.delete(postTemplates).where(eq(postTemplates.ownerId, teamId));
    }
    await db.delete(postTemplates).where(eq(postTemplates.name, 'F1 봉사 양식'));
    const noLeader = await db.select({ id: teams.id }).from(teams).where(eq(teams.name, NOLEADER_TEAM));
    for (const t of noLeader) {
      await db.delete(events).where(eq(events.teamId, t.id));
      await db.delete(teams).where(eq(teams.id, t.id));
    }
    await db.delete(teams).where(eq(teams.name, TEAM_NAME));
    await db.delete(boards).where(eq(boards.menuid, MENUID));
    const bu = await db.select({ id: users.id }).from(users).where(eq(users.email, BOARD_EMAIL));
    for (const u of bu) {
      await db.delete(memberships).where(eq(memberships.userId, u.id));
      await db.delete(users).where(eq(users.id, u.id));
    }
    await db.delete(users).where(eq(users.email, LEADER_EMAIL));
  }

  beforeAll(async () => {
    sql = postgres(DIRECT_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup();
    const [t] = await db.insert(teams).values({ name: TEAM_NAME, kind: 'activity' }).returning();
    teamId = t!.id;
    await db.insert(boards).values({ menuid: MENUID, name: 'F1 게시판', botCanWrite: true });
    const [u] = await db.insert(users).values({ email: LEADER_EMAIL, name: '팀장' }).returning();
    await db.insert(teamMembers).values({ teamId, userId: u!.id, position: 'leader' });
    board = { userId: u!.id, role: 'board', membershipActive: true, teams: [] };
    leader = { userId: u!.id, role: 'staff', membershipActive: true, teams: [{ teamId, position: 'leader' }] };
  });

  afterAll(async () => {
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  it('부원은 global 템플릿 생성 불가, 회장단은 가능', async () => {
    const member: Actor = { userId: leader.userId, role: 'member', membershipActive: true, teams: [] };
    await expect(
      createTemplate(db, member, { ownerType: 'global', name: 'x', titleTemplate: 'a', bodyTemplate: 'b' })
    ).rejects.toBeInstanceOf(PermissionError);
    const tpl = await createTemplate(db, board, {
      ownerType: 'global',
      name: 'F1 봉사 양식',
      titleTemplate: '{{간결_날짜}} 봉사 공지',
      bodyTemplate: '{{전체_날짜}} 집합 {{집합시간}}, 장소 {{장소}}, 정원 {{정원}}',
    });
    templateId = tpl.id;
    expect(tpl.ownerType).toBe('global');
    expect(tpl.ownerId).toBeNull();
  });

  it('일괄 생성: 미래 회차만 생성, 지난 회차는 skip, event+post 연결·템플릿 렌더', async () => {
    const preset: BatchPreset = {
      teamId,
      monthWeek: '1',
      weekday: 0, // 첫째 일요일
      meetTime: '14:00',
      boardMenuid: MENUID,
      templateId,
      noticeLeadDays: 7,
      publishTime: '20:00',
    };
    const now = new Date('2026-02-01T00:00:00Z');
    const res = await batchGenerate(db, leader, preset, { startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 3 }, now);

    // 2026-03 첫째 일요일=3/1, 발행=2/22 20:00 KST(미래) → 생성. 1·2월은 발행일 과거 → skip.
    expect(res.created).toHaveLength(1);
    expect(res.created[0]!.eventDate).toBe('2026-03-01');
    expect(res.skipped.filter((s) => s.reason === 'publish_past').length).toBe(2);

    const post = (await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, res.created[0]!.postId!)))[0]!;
    expect(post.eventId).toBe(res.created[0]!.eventId);
    expect(post.title).toBe('03/01 봉사 공지'); // {{간결_날짜}} 렌더
    expect(post.contentMd).toContain('2026년 3월 1일 일요일'); // {{전체_날짜}} 렌더
    expect(post.contentMd).toContain('집합 14:00'); // {{집합시간}} 렌더
    expect(post.contentMd).toContain('{{장소}}'); // 미치환(개별 수정에서 채움)
  });

  it('장소별 양식: 기본 장소·정원이 회차에 채워지고 발행 직전에 본문으로 치환된다', async () => {
    const tpl = await createTemplate(db, leader, {
      ownerType: 'team',
      ownerId: teamId,
      name: '양주 쉼터 봉사',
      titleTemplate: '{{간결_날짜}} 양주 쉼터 봉사',
      bodyTemplate: '장소 {{장소}} / 정원 {{정원}}',
      defaultPlace: '양주 쉼터',
      defaultCapacity: 20,
    });
    const preset: BatchPreset = {
      teamId,
      monthWeek: '2',
      weekday: 6, // 둘째 토요일
      meetTime: '10:00',
      boardMenuid: MENUID,
      templateId: tpl.id,
      noticeLeadDays: 7,
      publishTime: '20:00',
    };
    const res = await batchGenerate(
      db,
      leader,
      preset,
      { startYear: 2026, startMonth: 12, endYear: 2026, endMonth: 12 },
      new Date('2026-02-01T00:00:00Z')
    );
    expect(res.created).toHaveLength(1);

    // 기본값이 회차(events)에 복사된다 — 이후 회차별 수정의 출발점.
    const ev = (await db.select().from(events).where(eq(events.id, res.created[0]!.eventId!)))[0]!;
    expect(ev.place).toBe('양주 쉼터');
    expect(ev.capacity).toBe(20);

    // 본문에는 플레이스홀더가 그대로 남고, 발행 직전 치환에서만 값이 들어간다.
    const post = (await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, res.created[0]!.postId!)))[0]!;
    expect(post.contentMd).toBe('장소 {{장소}} / 정원 {{정원}}');
    const rendered = await renderForPublish(db, post);
    expect(rendered.contentMd).toBe('장소 양주 쉼터 / 정원 20');
    expect(rendered.unresolved).toEqual([]);

    // 회차별로 장소만 바꾸면(예약 수정) 본문 텍스트를 건드리지 않아도 최종본이 따라온다.
    await db.update(events).set({ place: '파주 쉼터' }).where(eq(events.id, ev.id));
    expect((await renderForPublish(db, post)).contentMd).toBe('장소 파주 쉼터 / 정원 20');

    // 값을 비우면 미치환으로 보고되어 발행이 차단된다.
    await db.update(events).set({ place: null }).where(eq(events.id, ev.id));
    expect((await renderForPublish(db, post)).unresolved).toEqual(['장소']);
  });

  it('미완성 점검: D-3 draft 예약 → 팀장단 알림 + 중복 방지', async () => {
    const now = new Date('2026-05-01T00:00:00Z');
    const publishAt = new Date('2026-05-04T11:00:00Z'); // KST 기준 D-3
    const draft = await createDraft(db, leader, {
      ownerType: 'team',
      ownerId: teamId,
      boardMenuid: MENUID,
      title: '미완성 공지',
      contentMd: '내용',
      publishAt,
    });

    const { mailer, sent } = captureMailer();
    const s1 = await runReadinessCheck(db, { mailer, now });
    expect(s1.incomplete).toBeGreaterThanOrEqual(1);
    expect(s1.alertsSent).toBeGreaterThanOrEqual(1);
    expect(sent.some((m) => (Array.isArray(m.to) ? m.to.includes(LEADER_EMAIL) : m.to === LEADER_EMAIL))).toBe(true);

    // 재실행 → 같은 날 중복 알림 없음
    const { mailer: m2, sent: sent2 } = captureMailer();
    const s2 = await runReadinessCheck(db, { mailer: m2, now });
    expect(sent2).toHaveLength(0);
    expect(s2.alertsSent).toBe(0);

    await db.delete(scheduledPosts).where(eq(scheduledPosts.id, draft.id));
  });

  it('미완성 점검: 팀장단 미배정 팀 → 회장단 폴백 알림', async () => {
    const [t2] = await db.insert(teams).values({ name: NOLEADER_TEAM, kind: 'activity' }).returning();
    const [bu] = await db.insert(users).values({ email: BOARD_EMAIL, name: '회장' }).returning();
    await db.insert(memberships).values({ userId: bu!.id, role: 'board', termStart: '2026-01-01', termEnd: '2030-01-01', status: 'active' });

    const now = new Date('2026-06-01T00:00:00Z');
    const publishAt = new Date('2026-06-04T11:00:00Z'); // KST 기준 D-3
    const boardActor: Actor = { userId: bu!.id, role: 'board', membershipActive: true, teams: [] };
    const draft = await createDraft(db, boardActor, {
      ownerType: 'team',
      ownerId: t2!.id, // 팀장단(team_members) 없음
      boardMenuid: MENUID,
      title: '폴백 공지',
      contentMd: '내용',
      publishAt,
    });

    const { mailer, sent } = captureMailer();
    const s = await runReadinessCheck(db, { mailer, now });
    expect(s.alertsSent).toBeGreaterThanOrEqual(1);
    // 팀장단이 없으므로 회장단(BOARD_EMAIL 포함)으로 폴백.
    expect(sent.some((m) => (Array.isArray(m.to) ? m.to.includes(BOARD_EMAIL) : m.to === BOARD_EMAIL))).toBe(true);

    await db.delete(scheduledPosts).where(eq(scheduledPosts.id, draft.id));
    await db.delete(memberships).where(eq(memberships.userId, bu!.id));
    await db.delete(users).where(eq(users.id, bu!.id));
    await db.delete(teams).where(eq(teams.id, t2!.id));
  });
});
