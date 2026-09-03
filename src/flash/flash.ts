// 번개(즉흥 소모임) — 개최 신청·승인, 선착순 신청·대기, 신청 건별 1:1 쪽지.
//
// 옮겨 온 것: "카톡방에 공지 → 개최자에게 개인톡" 이라는 지금 방식. 게시판으로 가져오는 이유는
// **순서가 어디에도 안 남기 때문이다.** 개인톡은 누가 먼저 말했는지 개최자 머릿속에만 있고,
// 정원이 찼을 때 근거가 없다. 신청을 행으로 받으면 선착순이 DB 가 아는 사실이 된다.
//
// 권한이 세 층이다:
//  - 개최(`flash.create`) = 부원 이상 누구나. 다만 **부원이 낸 것은 pending**(운영진 승인 대기),
//    운영진 이상이 낸 것은 곧바로 open 이다. 그 갈림은 `initialFlashStatus` 한 줄이다.
//  - 승인·거절(`flash.approve`) = 운영진 이상.
//  - 글 수정·마감·취소(`flash.manage`) = 개최자 본인(공동 개최자 포함), 회장단은 override.
//
// 날짜는 KST 'YYYY-MM-DD' 문자열이다(date 타입 = 시각 없음). 시간대를 끌어들이면 요일이
// 하루 밀린다 — 일정·봉사와 같은 규칙이다(`@/lib/kst-date`).

import { and, asc, desc, eq, gte, inArray, lte, ne, sql, type SQL } from 'drizzle-orm';
import type { Db, Database } from '@/db/types';
import { flashMeetups, flashHosts, flashSignups, flashMessages, users, memberships } from '@/db/schema';
import type { Actor, Role } from '@/auth/permissions';
import { isStaffPlus, isPrivileged } from '@/auth/permissions';
import { requireAuthorized } from '@/auth/guard';
import { buildAuditEntry, recordAudit } from '@/auth/audit';
import { kstToday, weekdayOf, kstLocalToInstant, kstDateTimeLabel } from '@/lib/kst-date';

/** 시스템 계정(발행 워커 등)은 사람이 아니라 공동 개최자 후보에 뜨면 안 된다. */
const SYSTEM_EMAIL = 'system@animalmate.local';

export type FlashMeetup = typeof flashMeetups.$inferSelect;
export type FlashStatus = FlashMeetup['status'];
export type FlashSignupStatus = (typeof flashSignups.$inferSelect)['status'];

/** 입력값이 형식에 맞지 않음. 라우트가 400 + 사람 말 사유로 매핑한다. */
export class FlashInputError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'FlashInputError';
  }
}

// ── 입력 검증(순수) ────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const TITLE_MAX = 100;
const PLACE_MAX = 200;
const DETAILS_MAX = 4000;
export const MESSAGE_MAX = 1000;
/**
 * 정원 상한. 동아리 전체가 300명이라 그보다 큰 값은 "무제한"과 뜻이 같은데,
 * 화면은 `3/999` 같은 숫자를 그리느라 자리를 낭비한다. 제한이 없을 셈이면 칸을 비운다.
 */
const CAPACITY_MAX = 300;

export interface FlashInput {
  title: string;
  meetDate: string; // YYYY-MM-DD
  meetTime?: string | null; // HH:MM. null = 시간 미정
  place?: string | null;
  details?: string | null;
  capacity?: number | null; // null = 인원 제한 없음
  /**
   * 신청을 받기 시작하는 순간. **KST 벽시계 문자열**('YYYY-MM-DDTHH:MM') 또는 ISO 문자열.
   * 비우면 곧바로 받는다.
   */
  signupOpenAt?: string | null;
  /** 공동 개최자로 함께 넣을 회원 id. 개최 신청자 본인은 서비스가 자동으로 넣는다. */
  coHostIds?: string[];
}

export interface NormalizedFlash {
  title: string;
  meetDate: string;
  meetTime: string | null;
  place: string | null;
  details: string | null;
  capacity: number | null;
  signupOpenAt: Date | null;
}

function trimOrNull(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
}

/**
 * 번개 입력 정규화·검증(순수). 화면 검증과 별개로 서버에서 다시 막는다(규칙 #6).
 *
 * 지난 날짜를 막지 않는 것은 의도다 — 어제 열린 번개를 뒤늦게 기록으로 남기는 일이 있고,
 * 자정 언저리에 "오늘"이 어느 쪽인지로 저장이 거부되면 쓰는 사람은 이유를 알 수 없다.
 * 지난 번개는 목록에서 `지난 번개`로 갈라 보여 주는 것으로 충분하다.
 */
export function normalizeFlashInput(input: FlashInput): NormalizedFlash {
  const title = (input.title ?? '').trim();
  if (!title) throw new FlashInputError('번개 이름을 입력해 주세요.');
  if (title.length > TITLE_MAX) throw new FlashInputError('번개 이름이 너무 길어요.');

  const meetDate = (input.meetDate ?? '').trim();
  if (!DATE_RE.test(meetDate)) throw new FlashInputError('언제 만날지 날짜를 골라 주세요.');

  // DB 왕복값('HH:MM:SS')을 그대로 돌려보내는 경우가 있어 초는 잘라낸다.
  const raw = trimOrNull(input.meetTime);
  const meetTime = raw ? raw.slice(0, 5) : null;
  if (meetTime !== null && !TIME_RE.test(meetTime)) {
    throw new FlashInputError('시간 형식이 올바르지 않아요(예: 14:30).');
  }

  const place = trimOrNull(input.place);
  if (place && place.length > PLACE_MAX) throw new FlashInputError('장소가 너무 길어요.');
  const details = trimOrNull(input.details);
  if (details && details.length > DETAILS_MAX) throw new FlashInputError('세부 내용이 너무 길어요.');

  const capacity = normalizeCapacity(input.capacity);
  const signupOpenAt = normalizeSignupOpenAt(input.signupOpenAt);
  return { title, meetDate, meetTime, place, details, capacity, signupOpenAt };
}

/**
 * 신청 시작 시각 정리 — 빈 칸은 null(바로 받는다).
 *
 * 화면이 주는 `datetime-local` 값은 **KST 벽시계**로 읽는다(`kstLocalToInstant`).
 * 브라우저 시간대에 맡기면 여행 중이거나 시계가 틀어진 기기 하나에서 9시간 밀린 값이 저장되고,
 * 그 순간이 곧 오픈런이라 기능이 통째로 거짓이 된다.
 * DB 왕복값(ISO 문자열)도 받아 준다 — 수정 화면이 받은 값을 그대로 되돌려 보내는 경로가 있다.
 */
export function normalizeSignupOpenAt(v: string | null | undefined): Date | null {
  const s = (v ?? '').trim();
  if (!s) return null;
  const kst = kstLocalToInstant(s);
  if (kst) return kst;
  const iso = new Date(s);
  if (Number.isNaN(iso.getTime())) throw new FlashInputError('신청 시작 시각 형식이 올바르지 않아요.');
  return iso;
}

/** 정원 칸 정리 — 빈 칸·0 이하는 전부 "제한 없음"(null)이다. */
export function normalizeCapacity(v: number | null | undefined): number | null {
  if (v == null) return null;
  if (!Number.isFinite(v)) throw new FlashInputError('정원은 숫자로 입력해 주세요.');
  const n = Math.floor(v);
  if (n <= 0) return null; // 0 = "아무도 못 온다"가 아니라 "안 정했다"는 뜻으로 받는다
  if (n > CAPACITY_MAX) throw new FlashInputError('정원이 너무 커요. 비워 두면 인원 제한이 없어요.');
  return n;
}

/** 쪽지 본문 정리(순수). **신청의 첫 줄도 이 검사를 지난다** — 메시지가 곧 신청이라서다. */
export function normalizeMessage(body: string | null | undefined): string {
  const s = (body ?? '').trim();
  if (!s) throw new FlashInputError('보낼 내용을 입력해 주세요.');
  if (s.length > MESSAGE_MAX) throw new FlashInputError('메시지가 너무 길어요.');
  return s;
}

/**
 * 개최 글이 처음 갖는 상태 — 부원은 승인 대기, 운영진 이상은 곧바로 모집 중.
 *
 * 권한 자체(`flash.create`)는 부원에게도 열려 있다. 부원을 authorize 단계에서 막으면
 * "개최 신청" 이라는 기능이 존재할 수 없기 때문이다. 통제는 여기서, 눈에 보이게 한다.
 */
export function initialFlashStatus(role: Role): FlashStatus {
  return isStaffPlus(role) ? 'open' : 'pending';
}

// ── 선착순·대기 계산(순수) ─────────────────────────────────────────────

export interface SeatRow {
  id: string;
  seq: number;
  status: FlashSignupStatus;
}

export interface Seat {
  status: 'confirmed' | 'waitlisted';
  /** 확정이면 "N번째", 대기면 "대기 N번". 둘 다 1부터. */
  order: number;
}

/**
 * 정원과 신청 순번만으로 자리를 **처음부터 다시** 계산한다.
 *
 * 취소가 났을 때 "맨 앞 대기자 한 명을 올린다"는 식으로 고치지 않는 이유: 그 방식은 지금 상태가
 * 옳다는 것을 전제로 한 수정이라, 한 번이라도 어긋나면(동시 취소, 정원 축소, 중간에 끼어든 신청)
 * 어긋난 채로 영원히 굴러간다. 매번 seq 순서로 다시 세면 어긋날 자리가 없다 —
 * 그래서 정원을 줄이는 수정에서도 별도 코드 없이 뒷사람이 대기로 내려간다.
 *
 * `capacity === null` = 인원 제한 없음 → 전원 확정.
 */
export function assignSeats(rows: SeatRow[], capacity: number | null): Map<string, Seat> {
  const live = rows.filter((r) => r.status !== 'canceled').sort((a, b) => a.seq - b.seq);
  const out = new Map<string, Seat>();
  let confirmed = 0;
  let waiting = 0;
  for (const r of live) {
    if (capacity === null || confirmed < capacity) {
      out.set(r.id, { status: 'confirmed', order: ++confirmed });
    } else {
      out.set(r.id, { status: 'waitlisted', order: ++waiting });
    }
  }
  return out;
}

/** 신청을 더 받을 수 있는 상태인가(대기 신청은 정원이 차도 받는다 — 그게 대기 줄의 목적이다). */
export function acceptsSignups(status: FlashStatus): boolean {
  return status === 'open';
}

/**
 * 지금 이 번개에 신청할 수 있는가 — 상태와 **신청 시작 시각**을 함께 본다.
 *
 *  - `open`      : 지금 보내면 된다.
 *  - `not_yet`   : 모집 중이지만 아직 시작 전이다(시작 시각을 알려 주고 기다리게 한다).
 *  - `closed`    : 개최자가 신청을 닫았다.
 *  - `unavailable`: 승인 전·거절·취소 — 신청이라는 개념이 아직/이미 없다.
 *
 * 상태를 하나 더 만들지 않고 파생값으로 두는 이유: `not_yet` 은 **시각이 지나면 저절로 풀린다.**
 * DB 에 상태로 박으면 그것을 풀어 줄 크론이 필요하고, 크론이 1분 늦으면 오픈런이 1분 밀린다.
 */
export type SignupWindow = 'open' | 'not_yet' | 'closed' | 'unavailable';

export function signupWindow(status: FlashStatus, signupOpenAt: Date | null, now: Date = new Date()): SignupWindow {
  if (status === 'closed') return 'closed';
  if (!acceptsSignups(status)) return 'unavailable';
  if (signupOpenAt && now.getTime() < signupOpenAt.getTime()) return 'not_yet';
  return 'open';
}

/** 게시판에 공개되는 상태인가(부원 목록에 보이는 조건). */
export function isPublicFlash(status: FlashStatus): boolean {
  return status === 'open' || status === 'closed';
}

// ── 조회 ───────────────────────────────────────────────────────────────

/**
 * 조회자가 볼 수 있는 번개만(보안 필터 — 반드시 WHERE 에 넣는다).
 *
 * - 운영진 이상: 전부. 승인 대기 건을 봐야 승인할 수 있다.
 * - 부원: 공개된 것(open·closed) + **내가 개최자인 것** + **내가 신청한 것**.
 *   마지막 조건이 있어야 내가 신청한 번개가 취소됐을 때 목록에서 사라지지 않는다 —
 *   사라지면 그 사람은 취소된 줄 모르고 약속 장소에 나간다.
 */
function visibleFlash(actor: Actor): SQL {
  if (isStaffPlus(actor.role)) return sql`true`;
  const iHost = sql`exists (select 1 from ${flashHosts} where ${flashHosts.flashId} = ${flashMeetups.id} and ${flashHosts.userId} = ${actor.userId})`;
  const iApplied = sql`exists (select 1 from ${flashSignups} where ${flashSignups.flashId} = ${flashMeetups.id} and ${flashSignups.userId} = ${actor.userId})`;
  return sql`(${flashMeetups.status} in ('open','closed') or ${iHost} or ${iApplied})`;
}

export interface PersonView {
  userId: string;
  name: string;
}

export interface FlashCounts {
  confirmed: number;
  waiting: number;
}

export interface FlashListItem {
  id: string;
  title: string;
  meetDate: string;
  weekday: string;
  meetTime: string | null;
  place: string | null;
  capacity: number | null;
  status: FlashStatus;
  /** 신청을 받기 시작하는 순간(ISO). null = 바로 받는다. */
  signupOpenAt: string | null;
  /** 지금 신청할 수 있는지 — 서버 시각 기준. 화면은 이 값으로 버튼을 정한다. */
  signupWindow: SignupWindow;
  hosts: PersonView[];
  counts: FlashCounts;
  /** 로그인한 본인의 신청 상태(신청 안 했으면 null). 목록에서 "신청함"을 바로 보여 준다. */
  mySignupStatus: FlashSignupStatus | null;
  /** 내가 개최자인가 — 목록에서 관리 버튼을 그릴지 판단. 실제 차단은 서버가 한다. */
  iAmHost: boolean;
  /** 아직 안 읽은 쪽지 수(개최자면 신청자들 것, 신청자면 개최자 답장). */
  unread: number;
}

/** 번개 여러 건의 개최자 이름을 한 번에. N+1 조회를 만들지 않기 위한 것. */
async function hostsByFlash(db: Db, ids: string[]): Promise<Map<string, PersonView[]>> {
  const out = new Map<string, PersonView[]>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({ flashId: flashHosts.flashId, userId: users.id, name: users.name })
    .from(flashHosts)
    .innerJoin(users, eq(users.id, flashHosts.userId))
    .where(inArray(flashHosts.flashId, ids));
  for (const r of rows) {
    const list = out.get(r.flashId) ?? [];
    list.push({ userId: r.userId, name: r.name });
    out.set(r.flashId, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return out;
}

/** 번개 여러 건의 확정·대기 인원 수를 한 번에. */
async function countsByFlash(db: Db, ids: string[]): Promise<Map<string, FlashCounts>> {
  const out = new Map<string, FlashCounts>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({ flashId: flashSignups.flashId, status: flashSignups.status, n: sql<number>`count(*)::int` })
    .from(flashSignups)
    .where(and(inArray(flashSignups.flashId, ids), ne(flashSignups.status, 'canceled')))
    .groupBy(flashSignups.flashId, flashSignups.status);
  for (const r of rows) {
    const c = out.get(r.flashId) ?? { confirmed: 0, waiting: 0 };
    if (r.status === 'confirmed') c.confirmed = r.n;
    else c.waiting = r.n;
    out.set(r.flashId, c);
  }
  return out;
}

export interface ListFlashOptions {
  /** 'upcoming' = 오늘 이후(날짜 오름차순), 'past' = 지난 것(내림차순). */
  scope?: 'upcoming' | 'past';
  limit?: number;
  now?: Date;
}

/** 게시판 목록. 조회자가 볼 수 있는 것만, 다가오는 순(또는 지난 것은 최근 순). */
export async function listFlashMeetups(db: Db, actor: Actor, opts: ListFlashOptions = {}): Promise<FlashListItem[]> {
  const today = kstToday(opts.now ?? new Date());
  const past = opts.scope === 'past';
  const range = past ? lte(flashMeetups.meetDate, sql`${today}::date - 1`) : gte(flashMeetups.meetDate, today);
  const rows = await db
    .select()
    .from(flashMeetups)
    .where(and(visibleFlash(actor), range))
    .orderBy(
      past ? desc(flashMeetups.meetDate) : asc(flashMeetups.meetDate),
      past ? desc(flashMeetups.meetTime) : asc(flashMeetups.meetTime),
      asc(flashMeetups.title)
    )
    .limit(Math.min(opts.limit ?? 100, 100));

  const ids = rows.map((r) => r.id);
  const [hosts, counts, mine, unread] = await Promise.all([
    hostsByFlash(db, ids),
    countsByFlash(db, ids),
    mySignupStatuses(db, actor, ids),
    unreadByFlash(db, actor, ids),
  ]);
  const now = opts.now ?? new Date();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    meetDate: r.meetDate,
    weekday: weekdayOf(r.meetDate),
    meetTime: r.meetTime ? r.meetTime.slice(0, 5) : null,
    place: r.place,
    capacity: r.capacity,
    status: r.status,
    signupOpenAt: r.signupOpenAt?.toISOString() ?? null,
    signupWindow: signupWindow(r.status, r.signupOpenAt, now),
    hosts: hosts.get(r.id) ?? [],
    counts: counts.get(r.id) ?? { confirmed: 0, waiting: 0 },
    mySignupStatus: mine.get(r.id) ?? null,
    iAmHost: (hosts.get(r.id) ?? []).some((h) => h.userId === actor.userId),
    unread: unread.get(r.id) ?? 0,
  }));
}

async function mySignupStatuses(db: Db, actor: Actor, ids: string[]): Promise<Map<string, FlashSignupStatus>> {
  const out = new Map<string, FlashSignupStatus>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({ flashId: flashSignups.flashId, status: flashSignups.status })
    .from(flashSignups)
    .where(and(inArray(flashSignups.flashId, ids), eq(flashSignups.userId, actor.userId)));
  for (const r of rows) out.set(r.flashId, r.status);
  return out;
}

// ── 안 읽은 쪽지 ───────────────────────────────────────────────────────
//
// 알림은 사이트 안에서만 한다(사용자 결정) — 번개 하나에 메일이 수십 통 나가는 것을 피한다.
// 그래서 "무엇이 새로 왔는지"를 화면이 스스로 셀 수 있어야 한다.
//
// 읽음 시각을 **개최자마다**(flash_hosts.read_at), **신청자마다**(flash_signups.applicant_read_at)
// 따로 두는 이유: 공동 개최자 중 한 명이 열어 보면 나머지 배지까지 꺼지면, 다른 개최자는
// 새 신청이 온 줄 모른 채 지나간다.

/** 번개별 안 읽은 쪽지 수(개최자 몫 + 신청자 몫). 목록·홈 배지가 함께 쓴다. */
async function unreadByFlash(db: Db, actor: Actor, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({ flashId: flashSignups.flashId, n: sql<number>`count(*)::int` })
    .from(flashMessages)
    .innerJoin(flashSignups, eq(flashSignups.id, flashMessages.signupId))
    .where(
      and(
        inArray(flashSignups.flashId, ids),
        ne(flashMessages.senderId, actor.userId), // 내가 쓴 것은 셀 이유가 없다
        unreadForActor(actor)
      )
    )
    .groupBy(flashSignups.flashId);
  for (const r of rows) out.set(r.flashId, r.n);
  return out;
}

/**
 * "이 쪽지가 나에게 안 읽은 것인가" 조건.
 *
 * 개최자 자리(flash_hosts.read_at)와 신청자 자리(flash_signups.applicant_read_at)를 **or** 로
 * 묶는다. 한 사람이 어떤 번개에서는 개최자이고 다른 번개에서는 신청자라, 어느 한쪽만 보면
 * 배지가 절반만 뜬다. 같은 사람이 자기 번개에 신청할 수는 없으므로 두 조건이 겹치지 않는다.
 */
function unreadForActor(actor: Actor): SQL {
  const hostSide = sql`exists (
    select 1 from ${flashHosts}
    where ${flashHosts.flashId} = ${flashSignups.flashId}
      and ${flashHosts.userId} = ${actor.userId}
      and (${flashHosts.readAt} is null or ${flashMessages.createdAt} > ${flashHosts.readAt})
  )`;
  const applicantSide = sql`(
    ${flashSignups.userId} = ${actor.userId}
    and (${flashSignups.applicantReadAt} is null or ${flashMessages.createdAt} > ${flashSignups.applicantReadAt})
  )`;
  return sql`(${hostSide} or ${applicantSide})`;
}

/**
 * 홈 배지용 총계 — 내가 개최자이거나 신청자인 번개에서 안 읽은 쪽지 수.
 *
 * 지난 번개는 세지 않는다. 끝난 일에 대한 배지는 끌 방법이 마땅치 않아 영영 켜져 있게 되고,
 * 그러면 배지 전체가 무시된다.
 */
export async function countFlashUnread(db: Db, actor: Actor, now: Date = new Date()): Promise<number> {
  const today = kstToday(now);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(flashMessages)
    .innerJoin(flashSignups, eq(flashSignups.id, flashMessages.signupId))
    .innerJoin(flashMeetups, eq(flashMeetups.id, flashSignups.flashId))
    .where(and(gte(flashMeetups.meetDate, today), ne(flashMessages.senderId, actor.userId), unreadForActor(actor)));
  return row?.n ?? 0;
}

/** 운영진 홈·게시판에 띄우는 "승인 기다리는 개최 신청" 수. */
export async function countPendingFlash(db: Db, actor: Actor): Promise<number> {
  if (!isStaffPlus(actor.role)) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(flashMeetups)
    .where(eq(flashMeetups.status, 'pending'));
  return row?.n ?? 0;
}

// ── 상세 ───────────────────────────────────────────────────────────────

export interface FlashMessageView {
  id: string;
  senderId: string;
  senderName: string;
  fromHost: boolean;
  body: string;
  createdAt: string; // ISO
}

export interface RosterEntry {
  userId: string;
  name: string;
  status: 'confirmed' | 'waitlisted';
  order: number;
}

export interface ThreadView {
  signupId: string;
  userId: string;
  name: string;
  status: FlashSignupStatus;
  order: number | null; // 취소된 신청은 순번이 없다
  canceledByHost: boolean;
  messages: FlashMessageView[];
  unread: number;
}

export interface FlashDetail extends FlashListItem {
  details: string | null;
  decisionNote: string | null;
  createdBy: string;
  /**
   * 이 응답을 만든 **서버 시각**(ISO). 화면이 카운트다운에 쓴다.
   *
   * 왜 필요한가: 신청 시작까지 남은 시간을 브라우저 시계로 세면 그 기기가 몇 분 틀어져 있을 때
   * "0초" 인데 서버는 아직 거부하거나, 반대로 이미 열렸는데 화면이 잠겨 있다. 오픈런에서는
   * 그 몇 초가 자리를 가른다 — 화면은 서버 시각과의 차이를 재서 그 위에 센다.
   */
  serverNow: string;
  /** 확정·대기 명단(이름·순번). 연락처는 절대 싣지 않는다 — 누가 함께 가는지만 알면 된다. */
  roster: RosterEntry[];
  /** 내 신청 한 건(쪽지 포함). 신청 안 했으면 null. */
  mine: ThreadView | null;
  /** 신청 건별 대화 — **개최자에게만** 간다. 회장단이라도 남의 1:1 대화는 읽지 않는다. */
  threads: ThreadView[] | null;
  /** 개최 승인·거절 버튼을 그릴지(운영진 이상 + pending). 실제 차단은 서버가 한다. */
  canApprove: boolean;
  canManage: boolean;
}

function toMessageView(
  m: { id: string; senderId: string; body: string; createdAt: Date; senderName: string },
  hostIds: Set<string>
): FlashMessageView {
  return {
    id: m.id,
    senderId: m.senderId,
    senderName: m.senderName,
    fromHost: hostIds.has(m.senderId),
    body: m.body,
    createdAt: m.createdAt.toISOString(),
  };
}

/**
 * 번개 상세. **볼 수 없으면 없는 것과 같다**(존재 여부도 알려주지 않는다 — 일정과 같은 규칙).
 */
export async function getFlashDetail(db: Db, actor: Actor, id: string, now: Date = new Date()): Promise<FlashDetail | null> {
  const [row] = await db
    .select()
    .from(flashMeetups)
    .where(and(eq(flashMeetups.id, id), visibleFlash(actor)))
    .limit(1);
  if (!row) return null;

  const hostRows = await db
    .select({ userId: users.id, name: users.name, readAt: flashHosts.readAt })
    .from(flashHosts)
    .innerJoin(users, eq(users.id, flashHosts.userId))
    .where(eq(flashHosts.flashId, id));
  hostRows.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const hostIds = new Set(hostRows.map((h) => h.userId));
  const iAmHost = hostIds.has(actor.userId);
  const myHostReadAt = hostRows.find((h) => h.userId === actor.userId)?.readAt ?? null;

  const signupRows = await db
    .select({
      id: flashSignups.id,
      userId: flashSignups.userId,
      name: users.name,
      status: flashSignups.status,
      seq: flashSignups.seq,
      applicantReadAt: flashSignups.applicantReadAt,
      canceledBy: flashSignups.canceledBy,
    })
    .from(flashSignups)
    .innerJoin(users, eq(users.id, flashSignups.userId))
    .where(eq(flashSignups.flashId, id))
    .orderBy(asc(flashSignups.seq));

  const seats = assignSeats(signupRows, row.capacity);
  const roster: RosterEntry[] = signupRows
    .filter((s) => seats.has(s.id))
    .map((s) => ({ userId: s.userId, name: s.name, ...seats.get(s.id)! }))
    .sort((a, b) => (a.status === b.status ? a.order - b.order : a.status === 'confirmed' ? -1 : 1));

  // 쪽지는 **내 신청 것**과, 내가 개최자라면 **이 번개의 전부**만 읽는다.
  const mySignup = signupRows.find((s) => s.userId === actor.userId) ?? null;
  const wantedIds = iAmHost ? signupRows.map((s) => s.id) : mySignup ? [mySignup.id] : [];
  const messages = wantedIds.length
    ? await db
        .select({
          id: flashMessages.id,
          signupId: flashMessages.signupId,
          senderId: flashMessages.senderId,
          senderName: users.name,
          body: flashMessages.body,
          createdAt: flashMessages.createdAt,
        })
        .from(flashMessages)
        .innerJoin(users, eq(users.id, flashMessages.senderId))
        .where(inArray(flashMessages.signupId, wantedIds))
        .orderBy(asc(flashMessages.createdAt))
    : [];
  const byThread = new Map<string, FlashMessageView[]>();
  for (const m of messages) {
    const list = byThread.get(m.signupId) ?? [];
    list.push(toMessageView(m, hostIds));
    byThread.set(m.signupId, list);
  }

  const thread = (s: (typeof signupRows)[number], asHost: boolean): ThreadView => {
    const msgs = byThread.get(s.id) ?? [];
    const since = asHost ? myHostReadAt : s.applicantReadAt;
    return {
      signupId: s.id,
      userId: s.userId,
      name: s.name,
      status: s.status,
      order: seats.get(s.id)?.order ?? null,
      canceledByHost: s.status === 'canceled' && s.canceledBy != null && s.canceledBy !== s.userId,
      messages: msgs,
      unread: msgs.filter((m) => m.senderId !== actor.userId && (!since || new Date(m.createdAt) > since)).length,
    };
  };

  const counts = { confirmed: 0, waiting: 0 };
  for (const seat of seats.values()) {
    if (seat.status === 'confirmed') counts.confirmed++;
    else counts.waiting++;
  }

  return {
    id: row.id,
    title: row.title,
    meetDate: row.meetDate,
    weekday: weekdayOf(row.meetDate),
    meetTime: row.meetTime ? row.meetTime.slice(0, 5) : null,
    place: row.place,
    capacity: row.capacity,
    status: row.status,
    signupOpenAt: row.signupOpenAt?.toISOString() ?? null,
    signupWindow: signupWindow(row.status, row.signupOpenAt, now),
    serverNow: now.toISOString(),
    details: row.details,
    decisionNote: row.decisionNote,
    createdBy: row.createdBy,
    hosts: hostRows.map((h) => ({ userId: h.userId, name: h.name })),
    counts,
    roster,
    mine: mySignup ? thread(mySignup, false) : null,
    threads: iAmHost ? signupRows.map((s) => thread(s, true)) : null,
    mySignupStatus: mySignup?.status ?? null,
    iAmHost,
    // 상세를 여는 쪽이 곧바로 읽음 처리하므로 목록용 총계는 여기서 세지 않는다.
    // 대화별 안 읽은 수는 각 thread.unread 에 들어 있다.
    unread: 0,
    canApprove: isStaffPlus(actor.role) && row.status === 'pending',
    canManage: iAmHost || isPrivileged(actor.role),
  };
}

// ── 쓰기 ───────────────────────────────────────────────────────────────

/** 번개 한 건의 개최자 id 목록(권한 판단의 근거). */
async function hostIdsOf(db: Database, flashId: string): Promise<string[]> {
  const rows = await db.select({ userId: flashHosts.userId }).from(flashHosts).where(eq(flashHosts.flashId, flashId));
  return rows.map((r) => r.userId);
}

/**
 * 공동 개최자 후보 정리 — 실제로 존재하고 **탈퇴하지 않은** 계정만 남긴다.
 * 없는 id 를 조용히 버리는 이유: 화면에서 고르는 값이라 사람이 손으로 넣을 일이 없고,
 * 넣었다면 그건 공격이거나 낡은 목록이다. 어느 쪽이든 번개 개최를 막을 이유는 아니다.
 */
async function validCoHosts(db: Database, ids: string[], selfId: string): Promise<string[]> {
  const wanted = [...new Set(ids)].filter((v) => v && v !== selfId);
  if (wanted.length === 0) return [];
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, wanted), sql`${users.withdrawnAt} is null`));
  return rows.map((r) => r.id);
}

/**
 * LIKE 패턴에서 특수문자를 죽인다. `%` 하나만 넣으면 전체 명단이 나오는데, 그것이 이 검색이
 * 막으려는 바로 그 일이다(값은 바인딩되므로 SQL 인젝션은 애초에 불가능하고, 여기서 막는 것은
 * **와일드카드로 조건을 무력화하는 것**이다).
 */
function escapeLike(v: string): string {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * 공동 개최자 후보 검색 — 이름 일부로 활성 회원을 찾는다.
 *
 * **두 글자 이상**을 요구하고 10명까지만 돌려준다. 이 화면은 명단을 훑는 곳이 아니라 이미
 * 아는 사람을 집어 오는 곳이라, 빈 검색으로 300명 전체 명단이 브라우저에 내려가면 안 된다
 * (규칙 #5 의 정신 — 회원 명단은 아무 데나 흘리지 않는다). 이름 말고는 아무것도 싣지 않는다:
 * 이메일·전화가 함께 가면 이 엔드포인트가 곧 회원 연락처 조회기가 된다.
 *
 * 탈퇴 계정과 시스템 계정은 뺀다. 멤버십이 만료된 사람도 뺀다 — 그런 계정은 쓰기가 전면
 * 거부되므로(규칙: membership active) 공동 개최자로 넣어 봐야 아무것도 못 한다.
 */
export async function searchCoHostCandidates(db: Db, actor: Actor, q: string): Promise<PersonView[]> {
  const term = (q ?? '').trim();
  if (term.length < 2) return [];
  const rows = await db
    .selectDistinct({ userId: users.id, name: users.name })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .where(
      and(
        eq(memberships.status, 'active'),
        sql`${users.withdrawnAt} is null`,
        ne(users.id, actor.userId), // 자기 자신은 이미 개최자다
        sql`${users.email} <> ${SYSTEM_EMAIL}`,
        sql`${users.name} ilike ${`%${escapeLike(term)}%`}`
      )
    )
    .orderBy(asc(users.name))
    .limit(10);
  return rows;
}

export async function createFlashMeetup(db: Db, actor: Actor, input: FlashInput): Promise<FlashMeetup> {
  requireAuthorized(actor, { kind: 'flash.create' });
  const v = normalizeFlashInput(input);
  const status = initialFlashStatus(actor.role);

  const row = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(flashMeetups)
      .values({
        ...v,
        status,
        createdBy: actor.userId,
        // 운영진이 스스로 연 번개는 이미 승인된 것과 같다 — 승인자를 비워 두면 나중에
        // "누가 열었나"를 개최자 목록에서 되짚어야 한다.
        decidedBy: status === 'open' ? actor.userId : null,
        decidedAt: status === 'open' ? new Date() : null,
      })
      .returning();
    const coHosts = await validCoHosts(tx, input.coHostIds ?? [], actor.userId);
    await tx.insert(flashHosts).values([actor.userId, ...coHosts].map((userId) => ({ flashId: created!.id, userId })));
    await recordAudit(
      tx,
      buildAuditEntry({
        actorUserId: actor.userId,
        action: status === 'open' ? 'flash.create' : 'flash.request',
        targetTable: 'flash_meetups',
        targetId: created!.id,
        after: { title: v.title, meetDate: v.meetDate, status, coHosts: coHosts.length },
      })
    );
    return created!;
  });
  return row;
}

export async function updateFlashMeetup(db: Db, actor: Actor, id: string, input: FlashInput): Promise<FlashMeetup> {
  const [before] = await db.select().from(flashMeetups).where(eq(flashMeetups.id, id)).limit(1);
  if (!before) throw new FlashInputError('없는 번개예요. 목록을 새로고침해 주세요.');
  const decision = requireAuthorized(actor, { kind: 'flash.manage', hosts: await hostIdsOf(db, id) });
  const v = normalizeFlashInput(input);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(flashMeetups)
      .set({ ...v, updatedAt: new Date() })
      .where(eq(flashMeetups.id, id))
      .returning();
    // 공동 개최자 교체(개최 신청자 본인은 항상 남는다 — 자기 번개에서 스스로를 지울 수는 없다).
    if (input.coHostIds) {
      const keep = await validCoHosts(tx, input.coHostIds, before.createdBy);
      await tx.delete(flashHosts).where(and(eq(flashHosts.flashId, id), ne(flashHosts.userId, before.createdBy)));
      if (keep.length > 0) {
        await tx.insert(flashHosts).values(keep.map((userId) => ({ flashId: id, userId })));
      }
    }
    // 정원이 줄면 뒷사람이 대기로 내려가고, 늘면 대기자가 올라온다. 계산은 한 곳에서만 한다.
    await resyncSeats(tx, id);
    await recordAudit(
      tx,
      buildAuditEntry({
        actorUserId: actor.userId,
        action: 'flash.update',
        targetTable: 'flash_meetups',
        targetId: id,
        before: { title: before.title, meetDate: before.meetDate, capacity: before.capacity },
        after: { title: v.title, meetDate: v.meetDate, capacity: v.capacity },
        override: decision.override,
      })
    );
    return row!;
  });
}

export type FlashDecision = 'approve' | 'reject';

/** 개최 신청 승인·거절(운영진 이상). pending 이 아닌 건은 손대지 않는다. */
export async function decideFlashMeetup(
  db: Db,
  actor: Actor,
  id: string,
  decision: FlashDecision,
  note?: string | null
): Promise<FlashMeetup> {
  requireAuthorized(actor, { kind: 'flash.approve' });
  const [before] = await db.select().from(flashMeetups).where(eq(flashMeetups.id, id)).limit(1);
  if (!before) throw new FlashInputError('없는 번개예요. 목록을 새로고침해 주세요.');
  if (before.status !== 'pending') throw new FlashInputError('이미 처리된 개최 신청이에요.');
  const reason = trimOrNull(note);
  if (decision === 'reject' && !reason) throw new FlashInputError('거절 사유를 적어 주세요. 신청한 사람이 다시 낼 수 있게요.');

  const [row] = await db
    .update(flashMeetups)
    .set({
      status: decision === 'approve' ? 'open' : 'rejected',
      decidedBy: actor.userId,
      decidedAt: new Date(),
      decisionNote: reason,
      updatedAt: new Date(),
    })
    .where(eq(flashMeetups.id, id))
    .returning();
  await recordAudit(
    db,
    buildAuditEntry({
      actorUserId: actor.userId,
      action: `flash.${decision}`,
      targetTable: 'flash_meetups',
      targetId: id,
      before: { status: before.status, title: before.title },
      after: { status: row!.status, note: reason },
    })
  );
  return row!;
}

export type FlashStateAction = 'close' | 'reopen' | 'cancel';

/** 개최자(회장단 override)가 신청을 닫거나 다시 열거나 번개를 취소한다. */
export async function setFlashState(
  db: Db,
  actor: Actor,
  id: string,
  action: FlashStateAction,
  note?: string | null
): Promise<FlashMeetup> {
  const [before] = await db.select().from(flashMeetups).where(eq(flashMeetups.id, id)).limit(1);
  if (!before) throw new FlashInputError('없는 번개예요. 목록을 새로고침해 주세요.');
  const decision = requireAuthorized(actor, { kind: 'flash.manage', hosts: await hostIdsOf(db, id) });
  if (before.status === 'pending' || before.status === 'rejected') {
    throw new FlashInputError('아직 승인되지 않은 번개예요.');
  }
  if (action !== 'cancel' && before.status === 'canceled') {
    throw new FlashInputError('이미 취소된 번개예요.');
  }
  const next: FlashStatus = action === 'cancel' ? 'canceled' : action === 'close' ? 'closed' : 'open';

  const [row] = await db
    .update(flashMeetups)
    .set({ status: next, decisionNote: action === 'cancel' ? trimOrNull(note) : before.decisionNote, updatedAt: new Date() })
    .where(eq(flashMeetups.id, id))
    .returning();
  await recordAudit(
    db,
    buildAuditEntry({
      actorUserId: actor.userId,
      action: `flash.${action}`,
      targetTable: 'flash_meetups',
      targetId: id,
      before: { status: before.status, title: before.title },
      after: { status: next },
      override: decision.override,
    })
  );
  return row!;
}

/**
 * 신청 자리를 seq 순서로 다시 계산해 바뀐 행만 UPDATE 한다.
 * 취소·정원 변경 뒤에 부른다. 계산 자체는 순수 함수(`assignSeats`)라 이 함수는 저장만 한다.
 */
async function resyncSeats(tx: Database, flashId: string): Promise<void> {
  const [meetup] = await tx
    .select({ capacity: flashMeetups.capacity })
    .from(flashMeetups)
    .where(eq(flashMeetups.id, flashId))
    .limit(1);
  if (!meetup) return;
  const rows = await tx
    .select({ id: flashSignups.id, seq: flashSignups.seq, status: flashSignups.status })
    .from(flashSignups)
    .where(eq(flashSignups.flashId, flashId));
  const seats = assignSeats(rows, meetup.capacity);
  for (const r of rows) {
    const seat = seats.get(r.id);
    if (!seat || seat.status === r.status) continue;
    await tx.update(flashSignups).set({ status: seat.status }).where(eq(flashSignups.id, r.id));
  }
}

export interface SignupResult {
  signupId: string;
  status: 'confirmed' | 'waitlisted';
  order: number;
}

/**
 * 번개 신청 — **메시지가 곧 신청이다**(사용자 결정). 첫 쪽지가 신청 행을 만든다.
 *
 * 트랜잭션 안에서 번개 행을 `FOR UPDATE` 로 잠근 뒤 순번을 딴다. 잠그지 않으면 두 사람이
 * 같은 순간에 신청했을 때 둘 다 같은 seq 를 받고, 하필 그 자리가 정원 경계면 누가 확정인지가
 * 뒤집힌다 — 선착순의 근거를 남기려고 이 기능을 만든 것이라 여기서 흔들리면 의미가 없다.
 */
export async function signUpToFlash(
  db: Db,
  actor: Actor,
  flashId: string,
  message: string,
  now: Date = new Date()
): Promise<SignupResult> {
  requireAuthorized(actor, { kind: 'flash.signup' });
  const body = normalizeMessage(message);

  return db.transaction(async (tx) => {
    const [meetup] = await tx
      .select()
      .from(flashMeetups)
      .where(eq(flashMeetups.id, flashId))
      .for('update')
      .limit(1);
    if (!meetup) throw new FlashInputError('없는 번개예요. 목록을 새로고침해 주세요.');
    // 신청 창은 **서버 시각으로** 연다. 화면이 카운트다운으로 버튼을 풀어 주더라도, 실제로
    // 자리를 주는 판단은 여기 한 곳뿐이다 — 시계를 앞당긴 기기가 먼저 들어가면 선착순이 아니다.
    const win = signupWindow(meetup.status, meetup.signupOpenAt, now);
    if (win === 'not_yet') {
      throw new FlashInputError(`아직 신청 시작 전이에요. ${kstDateTimeLabel(meetup.signupOpenAt!)}부터 신청할 수 있어요.`);
    }
    if (win !== 'open') {
      throw new FlashInputError(win === 'closed' ? '신청이 마감된 번개예요.' : '지금은 신청할 수 없는 번개예요.');
    }
    const hosts = await hostIdsOf(tx, flashId);
    if (hosts.includes(actor.userId)) throw new FlashInputError('내가 여는 번개에는 신청하지 않아도 돼요.');

    const rows = await tx
      .select({ id: flashSignups.id, seq: flashSignups.seq, status: flashSignups.status, userId: flashSignups.userId })
      .from(flashSignups)
      .where(eq(flashSignups.flashId, flashId));
    const existing = rows.find((r) => r.userId === actor.userId);
    if (existing && existing.status !== 'canceled') throw new FlashInputError('이미 신청한 번개예요.');

    // 취소했다가 다시 신청하면 **새 번호**를 받는다. 옛 번호를 살리면 한 번 빠졌던 사람이
    // 대기 줄 앞자리를 계속 쥐게 되어 선착순이 아니게 된다.
    const seq = rows.reduce((max, r) => Math.max(max, r.seq), 0) + 1;
    let signupId: string;
    if (existing) {
      await tx
        .update(flashSignups)
        .set({ seq, status: 'confirmed', canceledAt: null, canceledBy: null, applicantReadAt: new Date() })
        .where(eq(flashSignups.id, existing.id));
      signupId = existing.id;
    } else {
      const [created] = await tx
        .insert(flashSignups)
        .values({ flashId, userId: actor.userId, seq, status: 'confirmed', applicantReadAt: new Date() })
        .returning({ id: flashSignups.id });
      signupId = created!.id;
    }
    await tx.insert(flashMessages).values({ signupId, senderId: actor.userId, body });
    await resyncSeats(tx, flashId); // 방금 넣은 행이 정원 밖이면 여기서 대기로 내려간다

    const after = assignSeats(
      [...rows.filter((r) => r.id !== signupId), { id: signupId, seq, status: 'confirmed' }],
      meetup.capacity
    ).get(signupId)!;
    return { signupId, status: after.status, order: after.order };
  });
}

/**
 * 신청 취소. 본인은 자기 신청을, 개최자는 남의 신청을 내보낼 수 있다.
 * 확정 한 자리가 비면 맨 앞 대기자가 자동으로 올라온다(resyncSeats).
 */
export async function cancelFlashSignup(db: Db, actor: Actor, signupId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [signup] = await tx.select().from(flashSignups).where(eq(flashSignups.id, signupId)).limit(1);
    if (!signup) throw new FlashInputError('없는 신청이에요.');
    const hosts = await hostIdsOf(tx, signup.flashId);
    const mine = signup.userId === actor.userId;
    // 본인 취소는 권한 검사 대상이 아니다(자기 신청이다). 남의 신청을 내보내는 것만 개최자 권한.
    if (!mine) requireAuthorized(actor, { kind: 'flash.manage', hosts });
    if (signup.status === 'canceled') return; // 이미 없는 것과 성공을 구분할 이유가 없다

    await tx
      .update(flashSignups)
      .set({ status: 'canceled', canceledAt: new Date(), canceledBy: actor.userId })
      .where(eq(flashSignups.id, signupId));
    await resyncSeats(tx, signup.flashId);
    if (!mine) {
      await recordAudit(
        tx,
        buildAuditEntry({
          actorUserId: actor.userId,
          action: 'flash.signup.remove',
          targetTable: 'flash_signups',
          targetId: signupId,
          before: { status: signup.status, userId: signup.userId },
        })
      );
    }
  });
}

/** 쪽지 한 줄. 신청자 본인과 개최자만 그 대화에 쓸 수 있다. */
export async function postFlashMessage(db: Db, actor: Actor, signupId: string, message: string): Promise<FlashMessageView> {
  requireAuthorized(actor, { kind: 'flash.signup' });
  const body = normalizeMessage(message);
  const [signup] = await db.select().from(flashSignups).where(eq(flashSignups.id, signupId)).limit(1);
  if (!signup) throw new FlashInputError('없는 신청이에요.');
  const hosts = await hostIdsOf(db, signup.flashId);
  const isHost = hosts.includes(actor.userId);
  // **회장단이라도 남의 1:1 대화에는 못 쓴다.** 관리 권한은 번개 글을 다루라는 것이지
  // 사적인 대화에 끼어들라는 것이 아니다(그래서 여기만 flash.manage 를 쓰지 않는다).
  if (!isHost && signup.userId !== actor.userId) throw new FlashInputError('이 대화에는 참여할 수 없어요.');

  const [row] = await db.insert(flashMessages).values({ signupId, senderId: actor.userId, body }).returning();
  // 방금 쓴 사람은 이 대화를 지금 본 것이다 — 자기가 쓴 글이 안 읽은 것으로 남지 않게 한다.
  await markFlashRead(db, actor, signup.flashId);
  return {
    id: row!.id,
    senderId: actor.userId,
    senderName: actor.name ?? '',
    fromHost: isHost,
    body,
    createdAt: row!.createdAt.toISOString(),
  };
}

/**
 * 개최자가 **신청자 전원에게 같은 안내**를 보낸다(각자의 1:1 방에 한 줄씩 들어간다).
 *
 * 왜 필요한가: 장소가 바뀌거나 준비물이 생기면 개최자는 같은 문장을 방마다 다시 써야 했다.
 * 정원 10명이면 열 번이다 — 그러면 안 쓰게 되고, 알림이 사이트 안에만 있는 구조에서
 * 안 쓰이는 안내는 없는 것과 같다.
 *
 * **방을 합치지 않는다.** 공지판을 따로 만들면 답이 어디로 가야 하는지 애매해지고, 받는 사람은
 * 자기 사정(늦어요·못 가요)을 그 자리에 쓰게 된다. 각자의 방에 넣으면 답장이 원래 자리로 돌아온다.
 *
 * 취소한 사람에게는 보내지 않는다 — 이미 안 가는 사람이다.
 */
export async function broadcastFlashMessage(db: Db, actor: Actor, flashId: string, message: string): Promise<number> {
  const body = normalizeMessage(message);
  const hosts = await hostIdsOf(db, flashId);
  requireAuthorized(actor, { kind: 'flash.manage', hosts });
  // 회장단 override 로 남의 번개에 전체 안내를 보내는 길은 막는다 — 관리 권한은 글을 다루라는
  // 것이지 그 번개 사람들에게 개최자인 척 말하라는 것이 아니다.
  if (!hosts.includes(actor.userId)) throw new FlashInputError('이 번개의 개최자만 전체 안내를 보낼 수 있어요.');

  const targets = await db
    .select({ id: flashSignups.id })
    .from(flashSignups)
    .where(and(eq(flashSignups.flashId, flashId), ne(flashSignups.status, 'canceled')));
  if (targets.length === 0) return 0;
  await db.insert(flashMessages).values(targets.map((t) => ({ signupId: t.id, senderId: actor.userId, body })));
  await markFlashRead(db, actor, flashId); // 내가 쓴 것이 나에게 안 읽은 것으로 남지 않게
  return targets.length;
}

/**
 * 이 번개의 쪽지를 지금 다 봤다고 표시(배지 끄기). 개최자 자리와 신청자 자리를 동시에 찍는다 —
 * 한 사람이 둘 다일 수는 없지만, 어느 쪽인지 부르는 곳이 알 필요가 없어야 호출부가 단순해진다.
 */
export async function markFlashRead(db: Database, actor: Actor, flashId: string): Promise<void> {
  const now = new Date();
  await db
    .update(flashHosts)
    .set({ readAt: now })
    .where(and(eq(flashHosts.flashId, flashId), eq(flashHosts.userId, actor.userId)));
  await db
    .update(flashSignups)
    .set({ applicantReadAt: now })
    .where(and(eq(flashSignups.flashId, flashId), eq(flashSignups.userId, actor.userId)));
}
