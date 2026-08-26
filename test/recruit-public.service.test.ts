import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, inArray, like } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { users, recruitCohorts, recruitApplicants, rateLimits } from '@/db/schema';
import { RULES } from '@/http/rate-limit';
import { lookupApplicantResult } from '@/recruit/lookup';
import { lookupFailKey } from '@/recruit/lookup-key';
import { findApplicantInCohort, submitApplicant } from '@/recruit/applicants';
import { TEST_DATABASE_URL } from './db-url';

const suite = describe;

const OLD_LABEL = 'QA-PUBLIC-지난기수';
const NEW_LABEL = 'QA-PUBLIC-이번기수';
const EMAIL = 'qa-public@example.invalid';
const NAME = 'QA재지원자';
const PHONE = '01055556666';

// 조회 **총량**은 IP 단위다(값은 `RULES.recruitLookup`). 호출마다 다른 값을 줘 서로의 한도를
// 깎지 않게 한다 — 상한이 얼마든 이 테스트가 그 값에 매이지 않게 하려는 것이기도 하다.
//
// ⚠ 예전엔 `10.99.${++ipSeq}.1` 이었는데, ipSeq 는 **프로세스마다 1부터 다시 시작**한다 —
// 즉 실행이 바뀌어도 같은 값이 그대로 재사용됐다. 그래서 카운터가 실행을 건너뛰며 쌓였고,
// 2026-07-31 QA 때 테스트 DB 에서 `10.99.3.1` 의 실패 카운터가 **10 중 9까지** 차 있었다
// (한 번만 더 돌렸으면 이유 없이 429 로 깨졌다). 실행마다 다른 값을 쓰고 끝에 지운다.
// 실제 IP 형식일 필요는 없다 — 레이트 리밋 식별자 문자열일 뿐이다.
const RUN_TAG = `qa-lookup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
let ipSeq = 0;
const nextIp = () => `${RUN_TAG}-${++ipSeq}`;

/** 이 테스트가 조회에 쓰는 이름 전부 — 실패 카운터 정리 대상. */
const LOOKUP_NAMES = [NAME, '없는사람'];
const SECRET = process.env.SESSION_SECRET ?? '';

suite('공개 접수·조회 (실 DB)', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let oldCohortId: string;
  let newCohortId: string;
  let userId: string;

  async function cleanup() {
    const cs = await db.select({ id: recruitCohorts.id }).from(recruitCohorts).where(inArray(recruitCohorts.label, [OLD_LABEL, NEW_LABEL]));
    for (const c of cs) await db.delete(recruitCohorts).where(eq(recruitCohorts.id, c.id)); // applicants cascade
    await db.delete(users).where(eq(users.email, EMAIL));

    // 실패 카운터는 **이름**으로 묶인다(결정 80). IP 를 매번 바꾸는 것으로는 더 이상 초기화되지
    // 않으므로, 이 테스트가 만든 카운터는 이 테스트가 지운다. 안 지우면 조회에 실패하는 이름
    // ('없는사람')이 실행마다 1씩 쌓여, 같은 1시간 안에 열 번쯤 돌린 뒤부터 null 대신
    // RateLimitError 가 나서 **테스트가 이유 없이 깨진 것처럼 보인다.**
    const keys = LOOKUP_NAMES.map((n) => lookupFailKey(n, SECRET));
    await db
      .delete(rateLimits)
      .where(and(eq(rateLimits.bucket, RULES.recruitLookupFail.bucket), inArray(rateLimits.identifier, keys)));
    // 총량 카운터도 이 실행 몫만 지운다(RUN_TAG 접두사). 안 지우면 실행마다 행이 쌓인다.
    await db
      .delete(rateLimits)
      .where(and(eq(rateLimits.bucket, RULES.recruitLookup.bucket), like(rateLimits.identifier, `${RUN_TAG}%`)));
  }

  beforeAll(async () => {
    sql = postgres(TEST_DATABASE_URL, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup();

    const [u] = await db.insert(users).values({ email: EMAIL, name: 'QA공개' }).returning();
    userId = u!.id;

    // 지난 기수: 결과까지 공개된 상태(불합격). 이번 기수: 아직 아무것도 공개 안 함.
    const [oldC] = await db
      .insert(recruitCohorts)
      .values({ label: OLD_LABEL, createdBy: userId, resultPublic: true, schedulePublic: true })
      .returning();
    const [newC] = await db.insert(recruitCohorts).values({ label: NEW_LABEL, createdBy: userId }).returning();
    oldCohortId = oldC!.id;
    newCohortId = newC!.id;

    await db.insert(recruitApplicants).values({
      cohortId: oldCohortId,
      name: NAME,
      phone: PHONE,
      status: 'final_fail',
      createdAt: new Date('2025-01-01T00:00:00Z'),
    });
    await db.insert(recruitApplicants).values({
      cohortId: newCohortId,
      name: NAME,
      phone: PHONE,
      status: 'received',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
  });

  afterAll(async () => {
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  it('재지원자는 지난 기수가 아니라 최신 지원서 결과를 본다', async () => {
    // 정렬이 없으면 어느 행이 나올지 정해지지 않아, 이번 기수를 보러 온 사람에게
    // 지난 기수의 불합격이 뜰 수 있었다.
    const r = await lookupApplicantResult(NAME, PHONE, nextIp());
    expect(r).not.toBeNull();
    expect(r!.resultPublic).toBe(false); // 이번 기수는 아직 결과 비공개
    expect(r!.stage).not.toBe('final_fail');
  });

  it('전화번호를 하이픈과 함께 넣어도 같은 사람으로 찾는다', async () => {
    const r = await lookupApplicantResult(NAME, '010-5555-6666', nextIp());
    expect(r).not.toBeNull();
  });

  it('이름이 다르면 조회되지 않는다', async () => {
    expect(await lookupApplicantResult('없는사람', PHONE, nextIp())).toBeNull();
  });

  it('결과 공개 전에는 당락이 새지 않는다', async () => {
    const r = await lookupApplicantResult(NAME, PHONE, nextIp());
    expect(r!.congratsMessage).toBeNull();
    expect(r!.postPassNotice).toBeNull();
    expect(r!.assignedTeam).toBeNull();
  });

  it('같은 기수에 이미 낸 지원서를 찾아낸다 — 재제출이 갈아 끼울 대상', async () => {
    const dup = await findApplicantInCohort(newCohortId, NAME, PHONE);
    expect(dup).not.toBeNull();
  });

  it('전화번호 형식이 달라도 중복으로 본다', async () => {
    expect(await findApplicantInCohort(newCohortId, NAME, '010-5555-6666')).not.toBeNull();
    // 이름 앞뒤 공백도 같은 사람이다.
    expect(await findApplicantInCohort(newCohortId, ` ${NAME} `, PHONE)).not.toBeNull();
  });

  it('중복 제출은 행을 늘리지 않고 마지막 지원서로 갈아 끼운다', async () => {
    const before = await findApplicantInCohort(newCohortId, NAME, PHONE);
    expect(before).not.toBeNull();

    // 전화번호 형식과 이름 공백을 바꿔 내도 같은 사람으로 본다(위 두 테스트의 매칭 키).
    const outcome = await submitApplicant({
      cohortId: newCohortId,
      name: ` ${NAME} `,
      phone: '010-5555-6666',
      school: '고친학교',
      essayIntro: '고쳐서 다시 낸 자기소개',
    });

    expect(outcome).not.toBeNull();
    expect(outcome!.replaced).toBe(true);
    // **같은 행**이어야 한다 — 면접 배정·점수·메모가 이 id 를 물고 있다.
    expect(outcome!.applicantId).toBe(before!.id);

    const rows = await db
      .select()
      .from(recruitApplicants)
      .where(and(eq(recruitApplicants.cohortId, newCohortId), eq(recruitApplicants.name, NAME)));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.school).toBe('고친학교');
    expect(rows[0]!.essayIntro).toBe('고쳐서 다시 낸 자기소개');
  });

  it('처음 내는 지원서는 replaced 가 아니다', async () => {
    const outcome = await submitApplicant({
      cohortId: newCohortId,
      name: 'QA처음내는사람',
      phone: '01077778888',
      wishTeam1: '1팀',
    });
    expect(outcome!.replaced).toBe(false);
    expect(outcome!.previousScoreCount).toBe(0);

    const rows = await db
      .select()
      .from(recruitApplicants)
      .where(and(eq(recruitApplicants.cohortId, newCohortId), eq(recruitApplicants.name, 'QA처음내는사람')));
    expect(rows).toHaveLength(1);
    // 초기 배정팀은 1지망을 따라간다.
    expect(rows[0]!.assignedTeam).toBe('1팀');
  });

  it('운영진이 팀을 옮겨 놓은 지원자는 재제출이 그 배정을 되돌리지 않는다', async () => {
    await db
      .update(recruitApplicants)
      .set({ assignedTeam: '3팀' }) // 회장단이 손으로 옮긴 상태
      .where(and(eq(recruitApplicants.cohortId, newCohortId), eq(recruitApplicants.name, 'QA처음내는사람')));

    await submitApplicant({
      cohortId: newCohortId,
      name: 'QA처음내는사람',
      phone: '01077778888',
      wishTeam1: '2팀', // 지원자는 1지망을 바꿔서 다시 냈다
    });

    const [row] = await db
      .select()
      .from(recruitApplicants)
      .where(and(eq(recruitApplicants.cohortId, newCohortId), eq(recruitApplicants.name, 'QA처음내는사람')));
    expect(row!.wishTeam1).toBe('2팀'); // 지망은 새 값으로
    expect(row!.assignedTeam).toBe('3팀'); // 배정은 운영진 결정 그대로
  });

  it('다른 기수의 지원서는 중복이 아니다 — 재지원을 막으면 안 된다', async () => {
    const other = await db
      .insert(recruitCohorts)
      .values({ label: `${NEW_LABEL}-3`, createdBy: userId })
      .returning();
    const otherId = other[0]!.id;
    expect(await findApplicantInCohort(otherId, NAME, PHONE)).toBeNull();
    await db.delete(recruitCohorts).where(eq(recruitCohorts.id, otherId));
  });
});
