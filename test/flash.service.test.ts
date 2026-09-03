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
import { eq, like, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { flashMeetups, flashSignups, users, auditLogs } from '@/db/schema';
import {
  createFlashMeetup,
  updateFlashMeetup,
  decideFlashMeetup,
  setFlashState,
  signUpToFlash,
  cancelFlashSignup,
  postFlashMessage,
  getFlashDetail,
  listFlashMeetups,
  countFlashUnread,
  countPendingFlash,
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
