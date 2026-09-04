// 번개 — 선착순·대기 승격·쪽지 격리를 **실 DB 로** 증명한다.
//
// 왜 순수 테스트로 부족한가: `assignSeats` 는 배열을 받아 자리를 계산하는 함수라
// src/flash/flash.test.ts 가 이미 다 덮는다. 하지만 이 기능의 핵심은 그 계산이 아니라
//   ① 순번이 트랜잭션 안에서 제대로 채번되는가(선착순의 근거),
//   ② 취소·정원 변경 뒤에 DB 의 status 가 실제로 갱신되는가(resyncSeats),
//   ③ 쪽지가 **당사자와 개최자에게만** 나가는가(SQL 로 갈라 싣는 부분)
// 셋이고, 전부 DB 를 지나야 확인된다. 특히 ③ 은 잘못되면 회원끼리의 사적인 대화가 새는 자리다.
//
// 대상 DB 는 test/db-url.ts 가 정한다(운영을 가리키면 하드 실패). CLAUDE.md 코드 컨벤션.

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, like, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { flashMeetups, flashSignups, users, auditLogs } from '@/db/schema';
import {
  createFlashMeetup,
  updateFlashMeetup,
  decideFlashMeetup,
  setFlashState,
  signUpToFlash,
  placeFlashSignups,
  cancelFlashSignup,
  postFlashMessage,
  getFlashDetail,
  listFlashMeetups,
  countFlashUnread,
  countPendingFlash,
  broadcastFlashMessage,
  FlashInputError,
} from '@/flash/flash';
import { executeTool } from '@/rag/tools';
import { PermissionError } from '@/auth/guard';
import type { Actor } from '@/auth/permissions';
import { TEST_DATABASE_URL } from './db-url';

const PREFIX = 'FLASHTEST_';
// 픽스처 계정은 전부 `@example.invalid` — 실재하지 않는 주소이고, cleanup 이 이 목록으로 지운다.
const EMAILS = {
  host: 'flashtest-host@example.invalid',
  cohost: 'flashtest-cohost@example.invalid',
  staff: 'flashtest-staff@example.invalid',
  board: 'flashtest-board@example.invalid',
  a: 'flashtest-a@example.invalid',
  b: 'flashtest-b@example.invalid',
  c: 'flashtest-c@example.invalid',
} as const;

// 고정 미래 날짜. 오늘 기준으로 잡으면 자정 언저리에 "다가오는/지난"이 뒤집혀 테스트가 흔들린다.
const DATE = '2030-05-16';
const NOW = new Date('2030-05-01T00:00:00Z');

const actorOf = (userId: string, role: Actor['role']): Actor => ({
  userId,
  role,
  membershipActive: true,
  teams: [],
});

describe('번개 — 선착순·대기·쪽지', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let host: Actor; // member — 부원이 여는 번개(승인이 필요한 쪽)
  let cohost: Actor; // member — 공동 개최자
  let staff: Actor;
  let board: Actor;
  let a: Actor, b: Actor, c: Actor; // 신청자 셋

  async function cleanup() {
    const rows = await db.select({ id: flashMeetups.id }).from(flashMeetups).where(like(flashMeetups.title, `${PREFIX}%`));
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      // 신청·쪽지·개최자 행은 FK cascade 로 함께 지워진다. 감사 기록은 참조가 아니라 복사본이라 직접 지운다.
      await db.delete(auditLogs).where(inArray(auditLogs.targetId, ids));
      await db.delete(flashMeetups).where(inArray(flashMeetups.id, ids));
    }
    await db.delete(users).where(inArray(users.email, Object.values(EMAILS)));
  }

  /** 운영진이 곧바로 여는 번개(승인 단계를 건너뛴다). 대부분의 테스트가 여기서 시작한다. */
  async function openMeetup(title: string, capacity: number | null, coHostIds: string[] = []) {
    return createFlashMeetup(db, staff, { title: `${PREFIX}${title}`, meetDate: DATE, capacity, coHostIds });
  }

  /** 감사 기록은 신청 행 id 로 붙는데, 미리 넣기는 그 id 를 돌려주지 않는다(이름·순번만 준다). */
  async function signupIdOf(flashId: string, userId: string): Promise<string | undefined> {
    const [row] = await db
      .select({ id: flashSignups.id })
      .from(flashSignups)
      .where(and(eq(flashSignups.flashId, flashId), eq(flashSignups.userId, userId)));
    return row?.id;
  }

  beforeAll(async () => {
    sql = postgres(TEST_DATABASE_URL, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
  });

  afterAll(async () => {
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  // 각 테스트가 자기 픽스처만 보게 매번 새로 만든다 — 번개는 상태가 서로를 오염시키기 쉽다
  // (한 테스트의 취소가 다음 테스트의 대기 순번을 바꾼다).
  beforeEach(async () => {
    await cleanup();
    const made = await db
      .insert(users)
      .values([
        { email: EMAILS.host, name: '개최자' },
        { email: EMAILS.cohost, name: '공동개최자' },
        { email: EMAILS.staff, name: '운영진' },
        { email: EMAILS.board, name: '회장단' },
        { email: EMAILS.a, name: '신청자가' },
        { email: EMAILS.b, name: '신청자나' },
        { email: EMAILS.c, name: '신청자다' },
      ])
      .returning({ id: users.id, email: users.email });
    const id = (e: string) => made.find((u) => u.email === e)!.id;
    host = actorOf(id(EMAILS.host), 'member');
    cohost = actorOf(id(EMAILS.cohost), 'member');
    staff = actorOf(id(EMAILS.staff), 'staff');
    board = actorOf(id(EMAILS.board), 'board');
    a = actorOf(id(EMAILS.a), 'member');
    b = actorOf(id(EMAILS.b), 'member');
    c = actorOf(id(EMAILS.c), 'member');
  });

  // ── 개최와 승인 ──────────────────────────────────────────────────────

  it('부원이 낸 개최는 승인 대기로 들어가고, 운영진이 연 것은 곧바로 모집 중이다', async () => {
    const byMember = await createFlashMeetup(db, host, { title: `${PREFIX}부원번개`, meetDate: DATE });
    const byStaff = await openMeetup('운영진번개', null);
    expect(byMember.status).toBe('pending');
    expect(byStaff.status).toBe('open');
  });

  it('승인 대기 번개는 **다른 부원 눈에 안 보인다**(개최자·운영진에게만 보인다)', async () => {
    const m = await createFlashMeetup(db, host, { title: `${PREFIX}부원번개`, meetDate: DATE });
    expect(await getFlashDetail(db, a, m.id)).toBeNull(); // 존재 여부도 알려주지 않는다
    expect(await getFlashDetail(db, host, m.id)).not.toBeNull();
    expect(await getFlashDetail(db, staff, m.id)).not.toBeNull();
    expect(await countPendingFlash(db, staff)).toBeGreaterThan(0);
    expect(await countPendingFlash(db, a)).toBe(0); // 부원에게는 셈 자체가 0 이다
  });

  it('승인하면 부원에게 보이고, 거절하면 사유가 남는다', async () => {
    const ok = await createFlashMeetup(db, host, { title: `${PREFIX}승인될것`, meetDate: DATE });
    const no = await createFlashMeetup(db, host, { title: `${PREFIX}거절될것`, meetDate: DATE });
    await decideFlashMeetup(db, staff, ok.id, 'approve');
    await decideFlashMeetup(db, staff, no.id, 'reject', '그날 정기 봉사가 있어요');

    expect((await getFlashDetail(db, a, ok.id))?.status).toBe('open');
    expect(await getFlashDetail(db, a, no.id)).toBeNull(); // 거절 건은 남에게 안 보인다
    const mine = await getFlashDetail(db, host, no.id);
    expect(mine).toMatchObject({ status: 'rejected', decisionNote: '그날 정기 봉사가 있어요' });
  });

  it('거절에는 사유가 필수다 — 이유 없이 돌려보내면 다시 낼 방법을 모른다', async () => {
    const m = await createFlashMeetup(db, host, { title: `${PREFIX}사유없음`, meetDate: DATE });
    await expect(decideFlashMeetup(db, staff, m.id, 'reject', '  ')).rejects.toBeInstanceOf(FlashInputError);
  });

  it('부원은 남의 개최 신청을 승인할 수 없다', async () => {
    const m = await createFlashMeetup(db, host, { title: `${PREFIX}부원승인시도`, meetDate: DATE });
    await expect(decideFlashMeetup(db, a, m.id, 'approve')).rejects.toBeInstanceOf(PermissionError);
  });

  it('이미 처리된 개최 신청은 다시 승인되지 않는다', async () => {
    const m = await createFlashMeetup(db, host, { title: `${PREFIX}두번승인`, meetDate: DATE });
    await decideFlashMeetup(db, staff, m.id, 'approve');
    await expect(decideFlashMeetup(db, staff, m.id, 'approve')).rejects.toBeInstanceOf(FlashInputError);
  });

  // ── 공동 개최 ────────────────────────────────────────────────────────

  it('공동 개최자도 글을 고칠 수 있고, 개최자 목록에 함께 실린다', async () => {
    // 개최자를 **셋** 둔다 — 둘일 때만 도는 코드(배열 하나 넣기)를 지나치지 않으려는 것.
    const m = await openMeetup('공동개최', 5, [host.userId, cohost.userId]);
    const detail = await getFlashDetail(db, host, m.id);
    expect(detail!.hosts.map((h) => h.name)).toEqual(['개최자', '공동개최자', '운영진']); // 이름 가나다순
    expect(detail!.iAmHost).toBe(true);
    expect((await getFlashDetail(db, cohost, m.id))!.iAmHost).toBe(true);
    // 부원이지만 공동 개최자라 고칠 수 있다(역할이 아니라 개최자 여부가 기준이다).
    await updateFlashMeetup(db, host, m.id, { title: `${PREFIX}공동개최고침`, meetDate: DATE, capacity: 5 });
    expect((await getFlashDetail(db, host, m.id))!.title).toBe(`${PREFIX}공동개최고침`);
  });

  it('개최자가 아닌 부원은 남의 번개를 고칠 수 없다', async () => {
    const m = await openMeetup('남의번개', 5);
    await expect(
      updateFlashMeetup(db, a, m.id, { title: `${PREFIX}가로채기`, meetDate: DATE })
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it('회장단은 남의 번개도 다룰 수 있고 그 사실이 감사 기록에 override 로 남는다', async () => {
    const m = await openMeetup('회장단개입', 5);
    await setFlashState(db, board, m.id, 'cancel', '장소 사정');
    // 같은 번개에 감사 기록이 여럿 붙는다(개최 + 취소). 순서에 기대지 않고 취소 건을 집어 본다.
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.targetId, m.id));
    expect(logs.map((l) => l.action)).toContain('flash.cancel [override]');
  });

  // ── 선착순과 대기 ────────────────────────────────────────────────────

  it('먼저 보낸 순서대로 자리가 차고, 정원을 넘으면 대기 번호를 받는다', async () => {
    const m = await openMeetup('정원둘', 2);
    expect(await signUpToFlash(db, a, m.id, '참가하고 싶습니다!')).toMatchObject({ status: 'confirmed', order: 1 });
    expect(await signUpToFlash(db, b, m.id, '저도요')).toMatchObject({ status: 'confirmed', order: 2 });
    expect(await signUpToFlash(db, c, m.id, '테마 1 참가하고 싶습니다!')).toMatchObject({
      status: 'waitlisted',
      order: 1,
    });

    const detail = await getFlashDetail(db, staff, m.id);
    expect(detail!.counts).toEqual({ confirmed: 2, waiting: 1 });
    expect(detail!.roster.map((r) => `${r.name}:${r.status}${r.order}`)).toEqual([
      '신청자가:confirmed1',
      '신청자나:confirmed2',
      '신청자다:waitlisted1',
    ]);
  });

  it('정원이 없으면(빈 칸) 전원 확정이다', async () => {
    const m = await openMeetup('무제한', null);
    for (const who of [a, b, c]) await signUpToFlash(db, who, m.id, '가요');
    expect((await getFlashDetail(db, staff, m.id))!.counts).toEqual({ confirmed: 3, waiting: 0 });
  });

  it('확정자가 취소하면 **맨 앞 대기자가 자동으로 올라간다**', async () => {
    const m = await openMeetup('취소승격', 2);
    const sa = await signUpToFlash(db, a, m.id, '1등');
    await signUpToFlash(db, b, m.id, '2등');
    await signUpToFlash(db, c, m.id, '3등');

    await cancelFlashSignup(db, a, sa.signupId);

    const detail = await getFlashDetail(db, staff, m.id);
    expect(detail!.counts).toEqual({ confirmed: 2, waiting: 0 });
    expect(detail!.roster.map((r) => r.name)).toEqual(['신청자나', '신청자다']);
    // DB 의 status 자체가 갱신돼야 한다 — 화면에서만 다시 계산하면 챗봇·목록이 옛 값을 본다.
    const [row] = await db.select().from(flashSignups).where(eq(flashSignups.id, sa.signupId));
    expect(row!.status).toBe('canceled');
  });

  it('취소했다가 다시 신청하면 대기 줄 **맨 뒤**로 간다(옛 번호를 살리지 않는다)', async () => {
    const m = await openMeetup('재신청', 2);
    const sa = await signUpToFlash(db, a, m.id, '1등');
    await signUpToFlash(db, b, m.id, '2등');
    await signUpToFlash(db, c, m.id, '3등');
    await cancelFlashSignup(db, a, sa.signupId); // c 가 확정으로 올라간다
    expect(await signUpToFlash(db, a, m.id, '다시 갈게요')).toMatchObject({ status: 'waitlisted', order: 1 });
  });

  it('정원을 줄이면 뒷사람이 대기로 내려가고, 늘리면 대기자가 올라온다', async () => {
    const m = await openMeetup('정원변경', 3);
    for (const who of [a, b, c]) await signUpToFlash(db, who, m.id, '가요');
    const base = { title: `${PREFIX}정원변경`, meetDate: DATE };

    await updateFlashMeetup(db, staff, m.id, { ...base, capacity: 2 });
    expect((await getFlashDetail(db, staff, m.id))!.counts).toEqual({ confirmed: 2, waiting: 1 });

    await updateFlashMeetup(db, staff, m.id, { ...base, capacity: 5 });
    expect((await getFlashDetail(db, staff, m.id))!.counts).toEqual({ confirmed: 3, waiting: 0 });
  });

  it('개최자가 신청을 내보내면 자리가 넘어가고 감사 기록이 남는다(자진 취소는 안 남긴다)', async () => {
    const m = await openMeetup('내보내기', 1);
    const sa = await signUpToFlash(db, a, m.id, '1등');
    await signUpToFlash(db, b, m.id, '2등');

    await cancelFlashSignup(db, staff, sa.signupId);
    expect((await getFlashDetail(db, staff, m.id))!.roster).toEqual([
      expect.objectContaining({ name: '신청자나', status: 'confirmed' }),
    ]);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.targetId, sa.signupId));
    expect(logs).toHaveLength(1);
    expect(logs[0]!.action).toBe('flash.signup.remove');
  });

  it('같은 사람이 두 번 신청할 수 없고, 개최자는 자기 번개에 신청할 수 없다', async () => {
    const m = await openMeetup('중복신청', 5);
    await signUpToFlash(db, a, m.id, '가요');
    await expect(signUpToFlash(db, a, m.id, '또 가요')).rejects.toBeInstanceOf(FlashInputError);
    await expect(signUpToFlash(db, staff, m.id, '내가 여는데')).rejects.toBeInstanceOf(FlashInputError);
  });

  it('마감·취소된 번개에는 신청할 수 없다', async () => {
    const m = await openMeetup('마감', 5);
    await setFlashState(db, staff, m.id, 'close');
    await expect(signUpToFlash(db, a, m.id, '늦었나요')).rejects.toBeInstanceOf(FlashInputError);
    await setFlashState(db, staff, m.id, 'reopen');
    await signUpToFlash(db, a, m.id, '다시 열렸네요'); // 다시 열면 받는다
    await setFlashState(db, staff, m.id, 'cancel', '비 예보');
    await expect(signUpToFlash(db, b, m.id, '저도요')).rejects.toBeInstanceOf(FlashInputError);
  });

  it('승인 전 번개에는 신청할 수 없다', async () => {
    const m = await createFlashMeetup(db, host, { title: `${PREFIX}승인전`, meetDate: DATE });
    await expect(signUpToFlash(db, a, m.id, '가고 싶어요')).rejects.toBeInstanceOf(FlashInputError);
  });

  it('취소된 번개도 **신청했던 사람 목록에는 남는다** — 사라지면 취소된 줄 모르고 나간다', async () => {
    const m = await openMeetup('취소된번개', 5);
    await signUpToFlash(db, a, m.id, '가요');
    await setFlashState(db, staff, m.id, 'cancel', '비 예보');

    const forA = await listFlashMeetups(db, a, { now: NOW });
    expect(forA.map((f) => f.id)).toContain(m.id);
    // 신청하지 않은 부원에게는 안 보인다.
    expect((await listFlashMeetups(db, b, { now: NOW })).map((f) => f.id)).not.toContain(m.id);
  });

  // ── 명단에 미리 넣기(사전 배정) ───────────────────────────────────────
  //
  // 순수 테스트로 덮이지 않는 것만 여기서 본다: **자리를 빼앗지 않는가**(먼저 신청한 사람이
  // 밀려나면 선착순을 남기려고 만든 게시판이 스스로를 부정한다), 신청 창을 지나치는가,
  // 그리고 넣어진 사람이 그 뒤로 평범한 신청자처럼 굴러가는가(취소·대기 승격).

  it('개최자가 넣은 사람이 명단에 확정으로 들어가고, 넣은 표시가 함께 남는다', async () => {
    const m = await openMeetup('미리넣기', 3);
    const placed = await placeFlashSignups(db, staff, m.id, [a.userId]);
    expect(placed).toEqual([expect.objectContaining({ name: '신청자가', status: 'confirmed', order: 1 })]);

    const detail = await getFlashDetail(db, staff, m.id);
    expect(detail!.counts).toEqual({ confirmed: 1, waiting: 0 });
    expect(detail!.roster).toEqual([expect.objectContaining({ name: '신청자가', placed: true })]);
    // 첫 쪽지가 없는 유일한 신청이다 — 화면이 빈 대화를 설명할 수 있어야 한다.
    expect(detail!.threads![0]).toMatchObject({ placed: true, messages: [] });
  });

  it('여러 명을 **고른 순서대로** 넣는다 — 그 순서가 곧 정원 경계의 결과다', async () => {
    const m = await openMeetup('여럿넣기', 2);
    const placed = await placeFlashSignups(db, staff, m.id, [c.userId, a.userId, b.userId]);
    expect(placed.map((p) => `${p.name}:${p.status}${p.order}`)).toEqual([
      '신청자다:confirmed1',
      '신청자가:confirmed2',
      '신청자나:waitlisted1',
    ]);
  });

  it('**먼저 신청한 사람을 밀어내지 않는다** — 정원이 찼으면 넣어진 사람이 대기로 간다', async () => {
    const m = await openMeetup('자리안뺏음', 1);
    await signUpToFlash(db, a, m.id, '1등입니다');
    const placed = await placeFlashSignups(db, staff, m.id, [b.userId]);
    expect(placed[0]).toMatchObject({ status: 'waitlisted', order: 1 });
    expect((await getFlashDetail(db, staff, m.id))!.roster.map((r) => `${r.name}:${r.status}`)).toEqual([
      '신청자가:confirmed',
      '신청자나:waitlisted',
    ]);
  });

  it('신청 시작 시각 전에도 넣을 수 있다 — 자리를 미리 잡아 두는 것이 이 기능의 목적이다', async () => {
    const m = await createFlashMeetup(db, staff, {
      title: `${PREFIX}오픈런`,
      meetDate: DATE,
      capacity: 2,
      signupOpenAt: '2030-05-10T15:00',
    });
    const early = new Date('2030-05-01T00:00:00Z'); // 시작 한참 전
    // 부원은 아직 못 보낸다.
    await expect(signUpToFlash(db, a, m.id, '미리요', early)).rejects.toBeInstanceOf(FlashInputError);
    // 개최자는 넣을 수 있다.
    expect(await placeFlashSignups(db, staff, m.id, [a.userId])).toEqual([
      expect.objectContaining({ status: 'confirmed', order: 1 }),
    ]);
  });

  it('넣어진 사람은 **본인이 취소할 수 있고**, 그 자리는 대기자에게 넘어간다', async () => {
    const m = await openMeetup('넣고취소', 1);
    await placeFlashSignups(db, staff, m.id, [a.userId]);
    await signUpToFlash(db, b, m.id, '대기라도 걸게요');

    const forA = (await getFlashDetail(db, a, m.id))!;
    expect(forA.mine).toMatchObject({ status: 'confirmed', placed: true });
    await cancelFlashSignup(db, a, forA.mine!.signupId);

    expect((await getFlashDetail(db, staff, m.id))!.roster).toEqual([
      expect.objectContaining({ name: '신청자나', status: 'confirmed' }),
    ]);
  });

  it('넣어졌다가 취소한 사람이 스스로 신청하면 "개최자가 넣음" 표시가 지워진다', async () => {
    const m = await openMeetup('표시지움', 5);
    await placeFlashSignups(db, staff, m.id, [a.userId]);
    const forA = (await getFlashDetail(db, a, m.id))!;
    await cancelFlashSignup(db, a, forA.mine!.signupId);
    await signUpToFlash(db, a, m.id, '역시 갈게요');

    const mine = (await getFlashDetail(db, a, m.id))!.mine!;
    expect(mine).toMatchObject({ status: 'confirmed', placed: false });
    expect(mine.messages.map((x) => x.body)).toEqual(['역시 갈게요']);
  });

  it('한 명이라도 걸리면 **아무도 안 들어간다**(이미 신청한 사람이 섞인 경우)', async () => {
    const m = await openMeetup('전부아니면전무', 5);
    await signUpToFlash(db, a, m.id, '이미 왔어요');
    await expect(placeFlashSignups(db, staff, m.id, [b.userId, a.userId])).rejects.toBeInstanceOf(FlashInputError);
    // b 도 들어가지 않았어야 한다.
    expect((await getFlashDetail(db, staff, m.id))!.roster.map((r) => r.name)).toEqual(['신청자가']);
  });

  it('개최자 자신은 명단에 넣을 수 없다(자기 번개에 신청할 수 없는 것과 같은 규칙)', async () => {
    const m = await openMeetup('개최자넣기', 5, [host.userId]);
    await expect(placeFlashSignups(db, staff, m.id, [host.userId])).rejects.toBeInstanceOf(FlashInputError);
  });

  it('승인 전 번개에는 못 넣는다 — 거절되면 있지도 않은 번개가 그 사람에게 보인다', async () => {
    const m = await createFlashMeetup(db, host, { title: `${PREFIX}승인전넣기`, meetDate: DATE });
    await expect(placeFlashSignups(db, host, m.id, [a.userId])).rejects.toBeInstanceOf(FlashInputError);
  });

  it('취소된 번개에는 못 넣고, 마감된 번개에는 넣을 수 있다(뒤늦게 합류하는 사람이 있다)', async () => {
    const closed = await openMeetup('마감후넣기', 5);
    await setFlashState(db, staff, closed.id, 'close');
    expect(await placeFlashSignups(db, staff, closed.id, [a.userId])).toHaveLength(1);

    const canceled = await openMeetup('취소후넣기', 5);
    await setFlashState(db, staff, canceled.id, 'cancel', '비 예보');
    await expect(placeFlashSignups(db, staff, canceled.id, [b.userId])).rejects.toBeInstanceOf(FlashInputError);
  });

  it('개최자가 아닌 부원은 남의 번개 명단을 못 건드린다', async () => {
    const m = await openMeetup('남의명단', 5);
    await expect(placeFlashSignups(db, a, m.id, [b.userId])).rejects.toBeInstanceOf(PermissionError);
  });

  it('넣은 사람마다 감사 기록이 한 줄씩 남는다(회장단이 했으면 override 표시까지)', async () => {
    const m = await openMeetup('넣기기록', 5);
    const placed = await placeFlashSignups(db, board, m.id, [a.userId, b.userId]);
    for (const p of placed) {
      const [row] = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.targetId, (await signupIdOf(m.id, p.userId))!));
      expect(row!.action).toBe('flash.signup.place [override]');
    }
  });

  // ── 쪽지(1:1) ────────────────────────────────────────────────────────

  it('메시지가 곧 신청이다 — 첫 쪽지가 대화의 첫 줄로 남는다', async () => {
    const m = await openMeetup('쪽지시작', 5);
    await signUpToFlash(db, a, m.id, '테마 1 참가하고 싶습니다!');
    const mine = (await getFlashDetail(db, a, m.id))!.mine!;
    expect(mine.messages).toHaveLength(1);
    expect(mine.messages[0]).toMatchObject({ body: '테마 1 참가하고 싶습니다!', fromHost: false });
  });

  it('빈 메시지로는 신청되지 않는다(빈 신청이 생기면 개최자가 읽을 것이 없다)', async () => {
    const m = await openMeetup('빈신청', 5);
    await expect(signUpToFlash(db, a, m.id, '   ')).rejects.toBeInstanceOf(FlashInputError);
  });

  it('쪽지는 **당사자와 개최자만** 본다 — 다른 신청자에게는 대화 자체가 안 나간다', async () => {
    const m = await openMeetup('쪽지격리', 5, [host.userId]);
    await signUpToFlash(db, a, m.id, 'a 의 사정');
    await signUpToFlash(db, b, m.id, 'b 의 사정');

    // 신청자 b 는 자기 것만 받고, 남의 대화 목록(threads)은 통째로 null 이다.
    const forB = (await getFlashDetail(db, b, m.id))!;
    expect(forB.threads).toBeNull();
    expect(forB.mine!.messages.map((x) => x.body)).toEqual(['b 의 사정']);

    // 개최자·공동 개최자는 둘 다 본다.
    for (const who of [staff, host]) {
      const forHost = (await getFlashDetail(db, who, m.id))!;
      expect(forHost.threads!.flatMap((t) => t.messages.map((x) => x.body)).sort()).toEqual(['a 의 사정', 'b 의 사정']);
    }
  });

  it('**회장단이라도 남의 1:1 대화는 읽지도 쓰지도 못한다**(관리 권한은 글에 대한 것이다)', async () => {
    const m = await openMeetup('회장단격리', 5);
    const sa = await signUpToFlash(db, a, m.id, 'a 의 사정');

    const forBoard = (await getFlashDetail(db, board, m.id))!;
    expect(forBoard.threads).toBeNull(); // 볼 수는 있는 번개지만 대화는 안 실린다
    expect(forBoard.mine).toBeNull();
    await expect(postFlashMessage(db, board, sa.signupId, '끼어들기')).rejects.toBeInstanceOf(FlashInputError);
  });

  it('개최자가 답하면 신청자 쪽 대화에 개최자 표시로 붙는다', async () => {
    const m = await openMeetup('답장', 5);
    const sa = await signUpToFlash(db, a, m.id, '몇 시까지 가면 되나요?');
    await postFlashMessage(db, staff, sa.signupId, '30분까지는 괜찮아요');
    const mine = (await getFlashDetail(db, a, m.id))!.mine!;
    expect(mine.messages.map((x) => [x.body, x.fromHost])).toEqual([
      ['몇 시까지 가면 되나요?', false],
      ['30분까지는 괜찮아요', true],
    ]);
  });

  // ── 신청 시작 시각(오픈런) ───────────────────────────────────────────

  it('신청 시작 전에는 **서버가** 거부한다 — 화면이 열어 주더라도 자리는 안 준다', async () => {
    const m = await createFlashMeetup(db, staff, {
      title: `${PREFIX}오픈런`,
      meetDate: DATE,
      capacity: 5,
      signupOpenAt: '2030-05-10T15:00', // KST → 06:00Z
    });
    const before = new Date('2030-05-10T05:59:59Z');
    const after = new Date('2030-05-10T06:00:00Z'); // 정각은 열린 것

    await expect(signUpToFlash(db, a, m.id, '가요', before)).rejects.toBeInstanceOf(FlashInputError);
    expect(await signUpToFlash(db, a, m.id, '가요', after)).toMatchObject({ status: 'confirmed', order: 1 });
  });

  it('신청 시작 시각은 KST 벽시계로 저장된다(9시간 밀리지 않는다)', async () => {
    const m = await createFlashMeetup(db, staff, {
      title: `${PREFIX}시각저장`,
      meetDate: DATE,
      signupOpenAt: '2030-05-10T15:00',
    });
    const [row] = await db.select().from(flashMeetups).where(eq(flashMeetups.id, m.id));
    expect(row!.signupOpenAt!.toISOString()).toBe('2030-05-10T06:00:00.000Z');
  });

  it('화면이 보는 값도 서버 시각 기준이다(not_yet → open)', async () => {
    const m = await createFlashMeetup(db, staff, {
      title: `${PREFIX}창상태`,
      meetDate: DATE,
      signupOpenAt: '2030-05-10T15:00',
    });
    expect((await getFlashDetail(db, a, m.id, new Date('2030-05-10T05:00:00Z')))!.signupWindow).toBe('not_yet');
    expect((await getFlashDetail(db, a, m.id, new Date('2030-05-10T07:00:00Z')))!.signupWindow).toBe('open');
    const list = await listFlashMeetups(db, a, { now: new Date('2030-05-10T05:00:00Z') });
    expect(list.find((f) => f.id === m.id)!.signupWindow).toBe('not_yet');
  });

  it('시작 시각을 비우면 곧바로 받는다(기존 번개가 잠기지 않는다)', async () => {
    const m = await openMeetup('시각없음', 5);
    expect(await signUpToFlash(db, a, m.id, '가요')).toMatchObject({ status: 'confirmed' });
  });

  it('시작 시각을 나중에 붙이거나 뗄 수 있다', async () => {
    const m = await openMeetup('시각수정', 5);
    const base = { title: `${PREFIX}시각수정`, meetDate: DATE, capacity: 5 };
    await updateFlashMeetup(db, staff, m.id, { ...base, signupOpenAt: '2030-05-10T15:00' });
    await expect(signUpToFlash(db, a, m.id, '가요', new Date('2030-05-10T05:00:00Z'))).rejects.toBeInstanceOf(
      FlashInputError
    );
    await updateFlashMeetup(db, staff, m.id, { ...base, signupOpenAt: null });
    expect(await signUpToFlash(db, a, m.id, '가요', new Date('2030-05-10T05:00:00Z'))).toMatchObject({
      status: 'confirmed',
    });
  });

  // ── 전체 안내 ────────────────────────────────────────────────────────

  it('전체 안내는 신청자 **각자의 방**에 한 줄씩 들어간다(취소한 사람은 뺀다)', async () => {
    const m = await openMeetup('전체안내', 5);
    const sa = await signUpToFlash(db, a, m.id, 'a 가요');
    await signUpToFlash(db, b, m.id, 'b 가요');
    await signUpToFlash(db, c, m.id, 'c 가요');
    await cancelFlashSignup(db, c, (await getFlashDetail(db, staff, m.id))!.threads!.find((t) => t.name === '신청자다')!.signupId);

    expect(await broadcastFlashMessage(db, staff, m.id, '장소가 3번 출구로 바뀌었어요')).toBe(2);

    const detail = await getFlashDetail(db, staff, m.id);
    const bodies = (id: string) => detail!.threads!.find((t) => t.signupId === id)!.messages.map((x) => x.body);
    expect(bodies(sa.signupId)).toEqual(['a 가요', '장소가 3번 출구로 바뀌었어요']);
    // 취소한 사람 방에는 안 들어간다.
    const gone = detail!.threads!.find((t) => t.status === 'canceled')!;
    expect(gone.messages.map((x) => x.body)).toEqual(['c 가요']);
    // 받는 사람 쪽에서는 개최자 말로 보인다.
    expect((await getFlashDetail(db, a, m.id))!.mine!.messages.at(-1)).toMatchObject({ fromHost: true });
  });

  it('전체 안내는 개최자만 보낸다 — 회장단 override 도 막는다', async () => {
    const m = await openMeetup('안내권한', 5);
    await signUpToFlash(db, a, m.id, '가요');
    await expect(broadcastFlashMessage(db, a, m.id, '끼어들기')).rejects.toBeInstanceOf(PermissionError);
    // 회장단은 authorize 는 통과하지만(override) 서비스가 개최자가 아니라고 되돌려보낸다.
    await expect(broadcastFlashMessage(db, board, m.id, '회장단 공지')).rejects.toBeInstanceOf(FlashInputError);
  });

  // ── 챗봇 tool ────────────────────────────────────────────────────────

  it('챗봇 tool 은 공개된 번개만 주고, **이름은 싣지 않는다**', async () => {
    const open = await openMeetup('챗봇에보임', 2);
    await signUpToFlash(db, a, open.id, '가요');
    await createFlashMeetup(db, host, { title: `${PREFIX}승인전이라안보임`, meetDate: DATE });
    const canceled = await openMeetup('취소돼서안보임', 5);
    await setFlashState(db, staff, canceled.id, 'cancel', '사정');

    const rows = await executeTool(db, a, 'list_flash_meetups', { from: DATE }, NOW);
    const flash = rows.flash as { title: string; confirmed: number; capacity: number | null; full: boolean }[];
    const titles = flash.map((f) => f.title).filter((t) => t.startsWith(PREFIX));
    expect(titles).toEqual([`${PREFIX}챗봇에보임`]); // 승인 대기·취소 건은 빠진다

    const one = flash.find((f) => f.title === `${PREFIX}챗봇에보임`)!;
    expect(one).toMatchObject({ confirmed: 1, capacity: 2, full: false });
    // 결과 어디에도 회원 이름이 없어야 한다 — 있으면 챗봇이 "누가 신청했어?"에 답해 버린다.
    expect(JSON.stringify(rows)).not.toContain('신청자가');
    expect(JSON.stringify(rows)).not.toContain('운영진');
  });

  it('챗봇 tool 이 신청 시작 시각을 알려 준다("언제부터 신청해?")', async () => {
    await createFlashMeetup(db, staff, {
      title: `${PREFIX}오픈런안내`,
      meetDate: DATE,
      capacity: 5,
      signupOpenAt: '2030-05-10T15:00',
    });
    const rows = await executeTool(db, a, 'list_flash_meetups', { from: DATE }, new Date('2030-05-01T00:00:00Z'));
    const one = (rows.flash as { title: string; signupOpensAt: string | null; signupNotYet: boolean; acceptingSignups: boolean }[]).find(
      (f) => f.title === `${PREFIX}오픈런안내`
    )!;
    expect(one.signupNotYet).toBe(true);
    expect(one.acceptingSignups).toBe(false); // 아직은 못 보낸다
    expect(one.signupOpensAt).toBe('5월 10일(금) 오후 3:00');
  });

  it('챗봇 tool 은 번개가 없으면 게시판으로 안내할 근거를 함께 준다', async () => {
    const rows = await executeTool(db, a, 'list_flash_meetups', { from: '2031-01-01' }, NOW);
    expect(rows.count).toBe(0);
    expect(rows.flashLink).toBe('/flash');
    expect(typeof rows.note).toBe('string');
  });

  it('안 읽은 쪽지 수는 **받는 사람 기준**으로 센다(자기가 쓴 것은 세지 않는다)', async () => {
    const m = await openMeetup('안읽음', 5);
    const sa = await signUpToFlash(db, a, m.id, '가요');

    // 개최자는 아직 안 봤다 → 신청 메시지 1건이 안 읽은 것으로 잡힌다.
    expect(await countFlashUnread(db, staff, NOW)).toBe(1);
    // 신청자 본인은 자기가 쓴 것이라 0.
    expect(await countFlashUnread(db, a, NOW)).toBe(0);

    // 개최자가 상세를 열면(=읽음 표시) 꺼지고, 답장은 신청자 쪽에 1건으로 잡힌다.
    await postFlashMessage(db, staff, sa.signupId, '네 오세요'); // 보내면서 읽음 처리된다
    expect(await countFlashUnread(db, staff, NOW)).toBe(0);
    expect(await countFlashUnread(db, a, NOW)).toBe(1);
  });
});
