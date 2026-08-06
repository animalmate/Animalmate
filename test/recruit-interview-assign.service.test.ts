import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { users, memberships, recruitCohorts, recruitApplicants, recruitSlots } from '@/db/schema';
import { createPanelSlots, listPanelNames, getSlotById, deleteSlot } from '@/recruit/slots';
import { addSlotInterviewer, isAssignableInterviewer, getSlotInterviewers } from '@/recruit/slot-interviewers';
import { TEST_DATABASE_URL } from './db-url';

// 면접 배정(조·면접관)은 **면접 당일에 처음 부하가 걸리는 코드**다. 그때 틀리면 되돌릴 시간이 없다.
// 여기서 검증하는 것은 화면이 이미 막고 있는 것들의 **서버 쪽 짝**이다 —
// 화면 검증은 검증이 아니다(CLAUDE.md 규칙 #6). 탭이 두 개거나 요청이 직접 오면 화면은 없다.
const COHORT_LABEL = 'QA-ASSIGN-TEST기수';
const OTHER_COHORT_LABEL = 'QA-ASSIGN-다른기수';
const EMAILS = [
  'qa-assign-board@example.invalid',
  'qa-assign-staff@example.invalid',
  'qa-assign-member@example.invalid',
  'qa-assign-gone@example.invalid',
];

describe('모집 면접 배정 — 조·면접관 서버 검증 (실 DB)', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let cohortId: string;
  let otherCohortId: string;
  let boardId: string;
  let staffId: string;
  let memberId: string;
  let withdrawnId: string;

  async function cleanup() {
    const olds = await db
      .select({ id: recruitCohorts.id })
      .from(recruitCohorts)
      .where(inArray(recruitCohorts.label, [COHORT_LABEL, OTHER_COHORT_LABEL]));
    for (const c of olds) {
      await db.delete(recruitCohorts).where(eq(recruitCohorts.id, c.id)); // slots/applicants 는 cascade
    }
    await db.delete(users).where(inArray(users.email, EMAILS));
  }

  const makeUser = async (email: string, name: string, role: 'board' | 'staff' | 'member' | null) => {
    const [u] = await db.insert(users).values({ email, name }).returning();
    if (role) {
      await db
        .insert(memberships)
        .values({ userId: u!.id, role, termStart: '2026-01-01', termEnd: '2030-01-01', status: 'active' });
    }
    return u!.id;
  };

  beforeAll(async () => {
    sql = postgres(TEST_DATABASE_URL, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup(); // 이전 크래시 잔여 데이터 방지(멱등)

    boardId = await makeUser(EMAILS[0]!, 'QA회장단', 'board');
    staffId = await makeUser(EMAILS[1]!, 'QA운영진', 'staff');
    memberId = await makeUser(EMAILS[2]!, 'QA부원', 'member');
    // 탈퇴자: 멤버십은 운영진으로 남아 있어도 users.withdrawn_at 이 찍혀 있으면 배정 대상이 아니다.
    withdrawnId = await makeUser(EMAILS[3]!, 'QA탈퇴운영진', 'staff');
    await db.update(users).set({ withdrawnAt: new Date() }).where(eq(users.id, withdrawnId));

    const [c] = await db.insert(recruitCohorts).values({ label: COHORT_LABEL, createdBy: boardId }).returning();
    cohortId = c!.id;
    const [other] = await db
      .insert(recruitCohorts)
      .values({ label: OTHER_COHORT_LABEL, createdBy: boardId })
      .returning();
    otherCohortId = other!.id;
  });

  afterAll(async () => {
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  it('조를 만들면 시작~종료를 소요 시간으로 자른 만큼 슬롯이 선다', async () => {
    const slots = await createPanelSlots({
      cohortId,
      panel: 'A조',
      startsAt: new Date('2026-09-01T01:00:00Z'), // KST 10:00
      until: new Date('2026-09-01T03:00:00Z'), // KST 12:00
      durationMin: 30,
      venue: '동아리방',
      createdBy: boardId,
    });
    expect(slots).toHaveLength(4); // 10:00 / 10:30 / 11:00 / 11:30 — 12:00 은 만들지 않는다
    expect(slots.every((s) => s.panel === 'A조')).toBe(true);
    // 간격은 시작 시각에 분을 더해 나간다(로컬 날짜 문자열 재조립 없음).
    const times = slots.map((s) => new Date(s.startsAt).getTime()).sort((a, b) => a - b);
    expect(times[1]! - times[0]!).toBe(30 * 60_000);
  });

  it('폭주 방지 상한 — 범위가 며칠이어도 한 조가 200칸을 넘지 않는다', async () => {
    const slots = await createPanelSlots({
      cohortId: otherCohortId,
      panel: '폭주조',
      startsAt: new Date('2026-09-01T00:00:00Z'),
      until: new Date('2026-09-08T00:00:00Z'), // 7일 × 10분 = 1008칸 요구
      durationMin: 10,
      createdBy: boardId,
    });
    expect(slots).toHaveLength(200);
    await db.delete(recruitSlots).where(eq(recruitSlots.cohortId, otherCohortId));
  });

  it('이미 있는 조 이름을 기수 안에서 알아본다 — 라우트의 중복 차단 근거', async () => {
    const names = await listPanelNames(cohortId);
    expect(names).toContain('A조');
    // 다른 기수의 조 이름은 이 기수의 중복이 아니다(기수마다 A조가 있는 것이 정상).
    expect(await listPanelNames(otherCohortId)).not.toContain('A조');
  });

  it('면접관 배정 대상은 활성 임기의 운영진 이상뿐이다 — 부원·탈퇴자는 거부', async () => {
    expect(await isAssignableInterviewer(boardId)).toBe(true);
    expect(await isAssignableInterviewer(staffId)).toBe(true);
    expect(await isAssignableInterviewer(memberId)).toBe(false); // 부원
    expect(await isAssignableInterviewer(withdrawnId)).toBe(false); // 탈퇴(멤버십은 staff 로 남아 있어도)
  });

  it('면접관 목록에는 이메일이 실리지 않는다 — 화면이 쓰는 것은 이름뿐', async () => {
    const [slot] = await db.select().from(recruitSlots).where(eq(recruitSlots.cohortId, cohortId)).limit(1);
    await addSlotInterviewer(slot!.id, staffId);
    const list = await getSlotInterviewers(slot!.id);
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe('QA운영진');
    expect(Object.keys(list[0]!)).not.toContain('email');
  });

  it('슬롯을 지우면 지운 행을 돌려주고, 배정돼 있던 지원자의 배정이 풀린다', async () => {
    const [slot] = await db
      .insert(recruitSlots)
      .values({ cohortId, panel: 'B조', startsAt: new Date('2026-09-01T05:00:00Z'), createdBy: boardId })
      .returning();
    const [applicant] = await db
      .insert(recruitApplicants)
      .values({ cohortId, name: 'QA지원자', phone: '01000000001', status: 'doc_pass', slotId: slot!.id })
      .returning();

    const deleted = await deleteSlot(slot!.id);
    // 돌려받은 행이 audit 에 남길 유일한 근거다(지운 뒤에는 어디에도 없다).
    expect(deleted?.panel).toBe('B조');
    expect(await getSlotById(slot!.id)).toBeNull();

    const [after] = await db.select().from(recruitApplicants).where(eq(recruitApplicants.id, applicant!.id));
    expect(after!.slotId).toBeNull(); // FK on delete set null — 조용히 풀린다
  });

  it('없는 슬롯을 지우면 null 을 돌려준다(audit 을 남기지 않을 근거)', async () => {
    expect(await deleteSlot('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});
