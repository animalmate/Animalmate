import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { boards, users, teams, teamMembers, scheduledPosts, events, postTemplates, noticeCheckLog, auditLogs } from '@/db/schema';
import { createTemplate } from '@/publishing/post-templates';
import { batchGenerate, type BatchPreset } from '@/publishing/batch-generate';
import { runReadinessCheck } from '@/publishing/readiness-check';
import { createDraft } from '@/publishing/scheduled-posts';
import { PermissionError } from '@/auth/guard';
import type { Actor } from '@/auth/permissions';
import type { Mailer, GenericMail } from '@/auth/mailer';

const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const suite = DIRECT_URL ? describe : describe.skip;

const MENUID = 990072;
const LEADER_EMAIL = 'f1-leader@example.invalid';
const TEAM_NAME = 'F1테스트팀_zzz';

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
    await db.delete(teams).where(eq(teams.name, TEAM_NAME));
    await db.delete(boards).where(eq(boards.menuid, MENUID));
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
      titleTemplate: '{{날짜}} 봉사 공지',
      bodyTemplate: '집합 {{집합시간}}, 장소 {{장소}}, 정원 {{정원}}',
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
    expect(post.title).toBe('2026-03-01 봉사 공지'); // {{날짜}} 렌더
    expect(post.contentMd).toContain('집합 14:00'); // {{집합시간}} 렌더, {{장소}}는 미치환
    expect(post.contentMd).toContain('{{장소}}');
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
});
