// 동아리 일정(캘린더) — CRUD + 조회 범위 필터.
//
// 왜 문서가 아니라 여기인가: "동아리 일정"을 챗봇 문서로 적어 두면 학기가 바뀔 때마다 썩는다.
// 아무도 문서를 고치지 않기 때문이다. 일정을 표로 두면 챗봇이 tool 로 **지금 값**을 읽으므로
// 사람이 문서를 손대지 않아도 답이 낡지 않는다(결정 86).
//
// 권한이 두 층이다:
//  - 등록·수정·삭제 = 회장단·시스템관리자(`schedule.manage`). 일정은 동아리 공식 정보다.
//  - 조회 = 운영진 이상이 캘린더 화면에서, 부원은 챗봇으로. 어느 쪽이든 **보이는 범위는
//    visibility 가 가른다**(질문자·조회자 역할 이하 등급만). 필터는 SQL WHERE 에서 강제한다.
//
// 날짜는 전부 KST 기준 'YYYY-MM-DD' 문자열이다(date 타입 = 시각 없음). 시간대를 끌어들이면
// 요일이 하루 밀리는 사고가 난다(tools.ts weekdayOf 주석 참고).

import { and, asc, eq, inArray, lte, sql, type SQL } from 'drizzle-orm';
import type { Db } from '@/db/types';
import { schedules } from '@/db/schema';
import type { Actor } from '@/auth/permissions';
import { allowedVisibilities, type Visibility } from '@/auth/visibility';
import { requireAuthorized } from '@/auth/guard';
import { buildAuditEntry, recordAudit } from '@/auth/audit';

export type Schedule = typeof schedules.$inferSelect;

export interface ScheduleInput {
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string | null; // 여러 날 일정. null/생략 = 하루
  startTime?: string | null; // HH:MM. null/생략 = 시간 미정
  place?: string | null;
  details?: string | null;
  visibility: Visibility;
}

/** 입력값이 형식에 맞지 않음. 라우트에서 400 + 사람 말 사유로 매핑한다. */
export class ScheduleInputError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ScheduleInputError';
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const TITLE_MAX = 200;
const PLACE_MAX = 200;
const DETAILS_MAX = 4000;

function trimOrNull(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
}

/**
 * 입력 정규화 + 검증(순수). 서버에서 부르는 유일한 관문이라 화면 검증과 별개로 여기서 다시 막는다
 * (규칙 #6 — UI 검증은 검증이 아니다).
 */
export interface NormalizedSchedule {
  title: string;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  place: string | null;
  details: string | null;
  visibility: Visibility;
}

export function normalizeInput(input: ScheduleInput): NormalizedSchedule {
  const title = (input.title ?? '').trim();
  if (!title) throw new ScheduleInputError('일정 이름을 입력해 주세요.');
  if (title.length > TITLE_MAX) throw new ScheduleInputError('일정 이름이 너무 길어요.');

  const startDate = (input.startDate ?? '').trim();
  if (!DATE_RE.test(startDate)) throw new ScheduleInputError('시작 날짜를 골라 주세요.');

  const endDate = trimOrNull(input.endDate);
  if (endDate !== null) {
    if (!DATE_RE.test(endDate)) throw new ScheduleInputError('종료 날짜 형식이 올바르지 않아요.');
    if (endDate < startDate) throw new ScheduleInputError('종료 날짜가 시작 날짜보다 앞설 수 없어요.');
  }

  const startTime = trimOrNull(input.startTime);
  // 'HH:MM:SS' 로 들어오는 경우(DB 왕복값 재전송)도 받아 준다 — 초는 쓰지 않으므로 잘라낸다.
  const time = startTime ? startTime.slice(0, 5) : null;
  if (time !== null && !TIME_RE.test(time)) throw new ScheduleInputError('시간 형식이 올바르지 않아요(예: 14:30).');

  const place = trimOrNull(input.place);
  if (place && place.length > PLACE_MAX) throw new ScheduleInputError('장소가 너무 길어요.');
  const details = trimOrNull(input.details);
  if (details && details.length > DETAILS_MAX) throw new ScheduleInputError('세부사항이 너무 길어요.');

  const visibility = input.visibility;
  if (visibility !== 'member' && visibility !== 'staff' && visibility !== 'board') {
    throw new ScheduleInputError('공개 범위가 올바르지 않아요.');
  }

  // 종료일이 시작일과 같으면 "하루짜리"와 같은 뜻이다 — null 로 접어 두면 화면·챗봇이 분기를 덜 한다.
  return { title, startDate, endDate: endDate === startDate ? null : endDate, startTime: time, place, details, visibility };
}

/** 조회자가 볼 수 있는 등급만(보안 필터 — 반드시 WHERE 에 넣는다). */
function visibleTo(actor: Actor): SQL {
  return inArray(schedules.visibility, allowedVisibilities(actor));
}

/**
 * 일정이 [from, to] 구간에 걸치는가 = `start <= to` 그리고 `끝나는 날 >= from`.
 *
 * 끝나는 날은 `coalesce(end_date, start_date)` 다 — end_date 가 null 이면 하루짜리라 시작일이 곧 종료일이다.
 * (`end_date IS NULL OR end_date >= from` 으로 쓰면 **하루짜리 일정이 날짜와 무관하게 전부 걸린다.**
 *  2년 전 총회가 이번 달 캘린더에 뜨는 형태의 버그다.)
 */
function overlapsRange(from?: string, to?: string): SQL | undefined {
  const conds: SQL[] = [];
  if (to) conds.push(lte(schedules.startDate, to));
  if (from) conds.push(sql`coalesce(${schedules.endDate}, ${schedules.startDate}) >= ${from}`);
  return conds.length ? and(...conds) : undefined;
}

export interface ListOptions {
  /** YYYY-MM-DD. 이 날 이후로 끝나는 일정만. */
  from?: string;
  /** YYYY-MM-DD. 이 날 이전에 시작하는 일정만. */
  to?: string;
  limit?: number;
}

/** 조회자가 볼 수 있는 일정 목록. 날짜 오름차순(같은 날이면 시간 순, 시간 미정이 뒤). */
export async function listSchedules(db: Db, actor: Actor, opts: ListOptions = {}): Promise<Schedule[]> {
  const range = overlapsRange(opts.from, opts.to);
  return db
    .select()
    .from(schedules)
    .where(range ? and(visibleTo(actor), range) : visibleTo(actor))
    .orderBy(asc(schedules.startDate), asc(schedules.startTime), asc(schedules.title))
    .limit(Math.min(opts.limit ?? 500, 500));
}

/** 단건 조회. **볼 수 없는 등급이면 없는 것과 같다**(존재 여부도 알려주지 않는다). */
export async function getSchedule(db: Db, actor: Actor, id: string): Promise<Schedule | null> {
  const [row] = await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.id, id), visibleTo(actor)))
    .limit(1);
  return row ?? null;
}

export async function createSchedule(db: Db, actor: Actor, input: ScheduleInput): Promise<Schedule> {
  requireAuthorized(actor, { kind: 'schedule.manage' });
  const v = normalizeInput(input);
  const [row] = await db
    .insert(schedules)
    .values({ ...v, updatedBy: actor.userId })
    .returning();
  await recordAudit(
    db,
    buildAuditEntry({
      actorUserId: actor.userId,
      action: 'schedule.create',
      targetTable: 'schedules',
      targetId: row!.id,
      after: { title: v.title, startDate: v.startDate, visibility: v.visibility },
    })
  );
  return row!;
}

export async function updateSchedule(db: Db, actor: Actor, id: string, input: ScheduleInput): Promise<Schedule> {
  requireAuthorized(actor, { kind: 'schedule.manage' });
  const [before] = await db.select().from(schedules).where(eq(schedules.id, id)).limit(1);
  if (!before) throw new ScheduleInputError('없는 일정이에요. 목록을 새로고침해 주세요.');
  const v = normalizeInput(input);
  const [row] = await db
    .update(schedules)
    .set({ ...v, updatedBy: actor.userId, updatedAt: new Date() })
    .where(eq(schedules.id, id))
    .returning();
  await recordAudit(
    db,
    buildAuditEntry({
      actorUserId: actor.userId,
      action: 'schedule.update',
      targetTable: 'schedules',
      targetId: id,
      before: { title: before.title, startDate: before.startDate, visibility: before.visibility },
      after: { title: v.title, startDate: v.startDate, visibility: v.visibility },
    })
  );
  return row!;
}

export async function deleteSchedule(db: Db, actor: Actor, id: string): Promise<void> {
  requireAuthorized(actor, { kind: 'schedule.manage' });
  const [before] = await db.select().from(schedules).where(eq(schedules.id, id)).limit(1);
  if (!before) return; // 이미 없으면 성공과 구분할 이유가 없다
  await db.delete(schedules).where(eq(schedules.id, id));
  await recordAudit(
    db,
    buildAuditEntry({
      actorUserId: actor.userId,
      action: 'schedule.delete',
      targetTable: 'schedules',
      targetId: id,
      before: { title: before.title, startDate: before.startDate },
    })
  );
}
