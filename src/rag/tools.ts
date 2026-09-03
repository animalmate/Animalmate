// 챗봇 상태형 질의 tool — events(봉사 회차) 기반. "다가오는 봉사 목록" / "특정 날짜 회차 상세".
//
// RAG(문서 검색)는 "규정·안내" 같은 정적 지식에 답하고, 이 tool 은 "이번 주 봉사 어디야?" 처럼
// **지금 DB 상태**를 물을 때 쓴다. 모델이 스스로 판단해 호출한다(function calling).
// 봉사 정보(일시·장소·정원)는 부원 이상 전원 공개라 역할 필터 없이 조회한다.

import { and, asc, gte, lte, eq, ne, isNotNull, inArray, sql } from 'drizzle-orm';
import type { Db } from '@/db/types';
import { events, teams, scheduledPosts, teamGuidebooks, documents, flashMeetups, flashSignups } from '@/db/schema';
import type { GeminiTool } from './gemini';
import type { Actor } from '@/auth/permissions';
import { kstToday, weekdayOf } from '@/lib/kst-date';
import { listSchedules } from '@/schedules/schedules';
import { toChatbotView } from '@/schedules/view';
import { getVolunteerFallback } from './volunteer-fallback';

// 챗봇에 노출할 회차 = 다가오는(오늘 이후) + 취소 안 됨 + 장소가 정해진 것.
// - 취소: cancelPost 가 예약 취소 시 event.status 를 canceled 로 전이한다(고아 없음, 07-DECISIONS 24).
//   그래서 예약글 상태에 의존하지 않고 event.status 만으로 취소를 거를 수 있다.
// - 장소(place) 유무로 "안내할 만큼 정해졌는지"를 가른다 — 장소 없는 미완성 초안은 뜨지 않는다.
//   (예전엔 예약글이 scheduled/published 일 때만 노출했는데, 그러면 "만들어 뒀지만 아직 발행 예약 안 한"
//    회차가 안 보여 사용자 기대와 어긋났다. 발행(카페 업로드)과 챗봇 안내는 별개 관심사다.)

// 날짜 계산은 `@/lib/kst-date` 하나만 쓴다(일정 캘린더도 같은 구현을 본다 — 요일이 밀린 사고 재발 방지).
// 기존 import 경로(`@/rag/tools` 에서 weekdayOf)를 깨지 않도록 여기서 다시 내보낸다.
export { weekdayOf };

/** 이 회차 공지가 카페에 올라가는(올라간) 시각. 전부 KST. */
export interface UploadView {
  date: string; // YYYY-MM-DD
  weekday: string;
  time: string; // HH:MM
  done: boolean; // 이미 올라갔으면 true
}

export interface SessionView {
  date: string; // YYYY-MM-DD
  weekday: string; // 요일
  meetTime: string | null; // **봉사 집합 시각** HH:MM
  place: string | null;
  capacity: number | null;
  team: string;
  title: string;
  /**
   * **공지가 카페에 올라가는 시각**(집합 시각과 다르다). 연결된 예약이 없으면 null.
   * "몇 시에 올라와?" 는 이 값을 묻는 질문이다 — 예전에는 tool 이 이 값을 아예 몰라서
   * 모델이 집합 시각으로 답했다(2026-07-31).
   */
  upload: UploadView | null;
}

interface SessionRow {
  id: string;
  eventDate: string | null;
  meetTime: string | null;
  place: string | null;
  capacity: number | null;
  team: string | null;
  title: string;
}

function toView(r: SessionRow, upload: UploadView | null): SessionView {
  const date = r.eventDate ?? '';
  return {
    date,
    weekday: date ? weekdayOf(date) : '',
    meetTime: r.meetTime ? r.meetTime.slice(0, 5) : null,
    place: r.place,
    capacity: r.capacity,
    team: r.team ?? '',
    title: r.title,
    upload,
  };
}

/** UTC timestamp → KST 날짜·요일·시각. publish_at 은 timestamptz 라 시간대를 옮겨야 한다. */
export function toUploadView(publishAt: Date, done: boolean): UploadView {
  const kst = new Date(publishAt.getTime() + 9 * 3600 * 1000);
  const iso = kst.toISOString();
  const date = iso.slice(0, 10);
  return { date, weekday: weekdayOf(date), time: iso.slice(11, 16), done };
}

// 취소 안 됐고 장소가 정해진 회차만 뽑는 공통 select(events + team 이름).
function sessionSelect(db: Db) {
  return db
    .select({ id: events.id, eventDate: events.eventDate, meetTime: events.meetTime, place: events.place, capacity: events.capacity, team: teams.name, title: events.title })
    .from(events)
    .leftJoin(teams, eq(teams.id, events.teamId));
}

/**
 * 회차 id → 카페 업로드 정보. 예약글(scheduled_posts)에서 가져온다.
 *
 * events 에 join 하지 않고 따로 조회하는 이유: event 하나에 예약글이 여럿 달릴 수 있어
 * (post→event 다대일) join 하면 같은 회차가 여러 줄로 불어난다. 회차 목록은 한 회차당 한 줄이어야 한다.
 */
async function uploadsByEvent(db: Db, eventIds: string[]): Promise<Map<string, UploadView>> {
  if (eventIds.length === 0) return new Map();
  const rows = await db
    .select({ eventId: scheduledPosts.eventId, publishAt: scheduledPosts.publishAt, status: scheduledPosts.status })
    .from(scheduledPosts)
    .where(and(inArray(scheduledPosts.eventId, eventIds), isNotNull(scheduledPosts.publishAt)));

  const out = new Map<string, UploadView>();
  for (const r of rows) {
    if (!r.eventId || !r.publishAt) continue;
    const view = toUploadView(r.publishAt, r.status === 'published');
    const prev = out.get(r.eventId);
    // 예약글이 여럿이면 **가장 먼저 나가는** 것이 "언제 올라와?"의 답이다.
    if (!prev || `${view.date}T${view.time}` < `${prev.date}T${prev.time}`) out.set(r.eventId, view);
  }
  return out;
}
// 취소 아님 + 장소 있음(안내할 만큼 정해짐).
const announceable = () => and(ne(events.status, 'canceled'), isNotNull(events.place));

/** 다가오는 봉사 회차(오늘 이후, 취소 아님, 장소 정해짐). 날짜 오름차순. */
export async function listUpcomingSessions(db: Db, opts: { limit?: number; now?: Date } = {}): Promise<SessionView[]> {
  const today = kstToday(opts.now ?? new Date());
  const rows = await sessionSelect(db)
    .where(and(gte(events.eventDate, today), announceable()))
    .orderBy(asc(events.eventDate))
    .limit(Math.min(opts.limit ?? 10, 20));
  const uploads = await uploadsByEvent(db, rows.map((r) => r.id));
  return rows.map((r) => toView(r, uploads.get(r.id) ?? null));
}

/** 특정 날짜의 봉사 회차 상세(여러 팀이 같은 날이면 여러 건). */
export async function getSessionsOnDate(db: Db, dateStr: string, now: Date = new Date()): Promise<SessionView[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return [];
  void now;
  const rows = await sessionSelect(db).where(and(eq(events.eventDate, dateStr), announceable())).orderBy(asc(events.meetTime));
  const uploads = await uploadsByEvent(db, rows.map((r) => r.id));
  return rows.map((r) => toView(r, uploads.get(r.id) ?? null));
}

// ── 팀 가이드북(회차가 없을 때의 두 번째 근거) ────────────────────────
//
// 왜 필요한가: 등록된 회차가 없다고 "봉사 없어요"로 끝내면 틀린 답이 된다. 팀마다 봉사를 여는
// 요일·주기가 정해져 있고 그것이 가이드북에 적혀 있다. 확정 일정이 없을 때는 **평소 방식**이
// 부원에게 가장 쓸모 있는 답이다.
//
// 왜 문서 검색(RAG)에 맡기지 않고 tool 을 따로 두나: RAG 검색은 **질문이 들어온 순간 한 번**
// 돌고 끝난다. "2팀 봉사 언제야?" 로 검색했을 때 2팀 가이드북의 '봉사 주기' 대목이 top-k 에
// 들어올지는 운이다. 회차가 없다는 것을 확인한 **뒤에** 그 팀 가이드북을 펴 보는 것이 순서라,
// 모델이 그 시점에 부를 수 있는 도구가 필요하다.

/**
 * 가이드북 본문 길이 상한. 저장되는 것이 **운영 정보 요약**이라 정상값은 200~500자다
 * (gemini.ts 의 추출 지시). 상한은 이상한 값이 통째로 흘러드는 것을 막는 안전망일 뿐이다.
 */
const GUIDEBOOK_MAX_CHARS = 2000;

/**
 * 챗봇이 가이드북 원문으로 안내할 때 쓰는 주소.
 *
 * 서명된 파일 주소(Storage)를 주지 않는 이유: 그 주소는 30분이면 만료되고, 대화 로그에도 남는다.
 * 만료된 링크가 답변에 박혀 있으면 "가이드북이 안 열린다"가 된다. 화면 주소를 주면 로그인한
 * 사람만 열리고(가이드북은 내부 자료다) 링크가 늙지 않는다.
 */
export const GUIDEBOOK_PAGE_PATH = '/guidebooks';

export interface GuidebookLookup {
  team: string;
  found: boolean;
  /** 봉사 운영 정보 요약(챗봇이 근거로 쓰는 것). 가이드북 전문이 아니다. */
  content: string | null;
  /** 원문 PDF 를 볼 수 있는 화면 주소. 요약에 없는 것을 물었을 때 여기로 안내한다. */
  guidebookLink: string | null;
}

/**
 * 팀 이름으로 가이드북 본문을 가져온다. 챗봇이 읽는 것은 **확인을 마친 본문**(status='ready')뿐이다
 * — 검수 전 본문(pendingText)은 사람이 아직 안 본 글이라 답변 근거가 될 수 없다.
 *
 * visibility 필터를 따로 걸지 않는 이유: 가이드북 문서는 항상 member 등급으로 저장된다
 * (saveGuidebookDocument 가 고정). 부원 이상이면 누구나 볼 수 있는 자료다.
 */
export async function getTeamGuidebook(db: Db, teamName: string): Promise<GuidebookLookup> {
  const name = teamName.trim();
  if (!name) return { team: teamName, found: false, content: null, guidebookLink: null };

  const [row] = await db
    .select({ content: documents.contentMd, team: teams.name })
    .from(teamGuidebooks)
    .innerJoin(teams, eq(teams.id, teamGuidebooks.teamId))
    .innerJoin(documents, eq(documents.id, teamGuidebooks.documentId))
    .where(and(eq(teams.name, name), eq(teamGuidebooks.status, 'ready')))
    .limit(1);

  if (!row) return { team: name, found: false, content: null, guidebookLink: null };
  return {
    team: row.team,
    found: true,
    content: row.content.slice(0, GUIDEBOOK_MAX_CHARS),
    guidebookLink: GUIDEBOOK_PAGE_PATH,
  };
}

/** 가이드북 **파일**이 올라와 있는 팀(요약 추출이 실패했어도 원문 링크는 줄 수 있다). */
export async function teamsWithGuidebookFile(db: Db): Promise<string[]> {
  const rows = await db
    .select({ name: teams.name })
    .from(teamGuidebooks)
    .innerJoin(teams, eq(teams.id, teamGuidebooks.teamId));
  return rows.map((r) => r.name).sort((a, b) => a.localeCompare(b, 'ko'));
}

/** 가이드북이 올라와 있는(챗봇이 읽을 수 있는) 팀 이름들. 회차가 없을 때 모델에게 선택지를 준다. */
export async function teamsWithGuidebook(db: Db): Promise<string[]> {
  const rows = await db
    .select({ name: teams.name })
    .from(teamGuidebooks)
    .innerJoin(teams, eq(teams.id, teamGuidebooks.teamId))
    .where(eq(teamGuidebooks.status, 'ready'));
  return rows.map((r) => r.name).sort((a, b) => a.localeCompare(b, 'ko'));
}

/** 질문자가 속한 활동팀 이름(가이드북을 어느 팀 것으로 펴 볼지 정하는 데 쓴다). */
export async function actorTeamNames(db: Db, actor: Actor): Promise<string[]> {
  const ids = actor.teams.map((t) => t.teamId);
  if (ids.length === 0) return [];
  const rows = await db.select({ name: teams.name }).from(teams).where(inArray(teams.id, ids));
  return rows.map((r) => r.name);
}

// ── 번개(즉흥 소모임) ──────────────────────────────────────────────────
//
// 왜 문서가 아니라 tool 인가: 일정(결정 86)과 같은 이유다. 번개는 며칠 단위로 생겼다 사라지는
// 것이라 문서로 적어 두면 적는 순간 낡는다. 표를 읽으면 사람이 손대지 않아도 답이 늘 지금 값이다.
//
// **이름을 싣지 않는다.** 개최자도 신청자도 아니다 — 챗봇은 회원 명단·개인정보 요청에 응하지
// 않는다는 규칙(시스템 프롬프트 3, CLAUDE.md 규칙 #5)이 있고, 여기서 이름을 흘리면 "누가 신청했어?"
// 라는 질문에 챗봇이 답해 버린다. 인원 **수**는 집계라 그 규칙에 걸리지 않고, 갈지 말지를
// 정하는 데 실제로 쓰인다. 누가 여는지는 게시판을 열면 나온다.

/** 번개 세부 내용을 tool 결과에 실을 때의 상한. 답변 근거로 쓰기에 충분하고, 통째로 흘리지 않는다. */
const FLASH_DETAILS_MAX_CHARS = 500;

/** 챗봇이 안내할 수 있는 번개 = 승인이 끝나 게시판에 떠 있는 것(모집 중·마감)뿐이다. */
const CHATBOT_FLASH_STATUSES = ['open', 'closed'] as const;

/** 번개 게시판 화면 주소. 서명 URL 이 아니라 화면 주소라 늙지 않는다(가이드북과 같은 이유). */
export const FLASH_PAGE_PATH = '/flash';

export interface FlashChatView {
  title: string;
  date: string; // YYYY-MM-DD
  weekday: string;
  time: string | null; // 집합 시각 HH:MM. null = 아직 안 정함
  place: string | null;
  /** null = 인원 제한 없음. */
  capacity: number | null;
  confirmed: number;
  waiting: number;
  /** 정원이 차서 지금 신청하면 대기로 들어가는가. */
  full: boolean;
  /** 신청을 아직 받는가(마감했으면 false). */
  acceptingSignups: boolean;
  details: string | null;
}

/**
 * 번개 목록(기본은 오늘 이후). `from` 에 과거 날짜를 주면 **개최 내역**이 된다 —
 * "지난달에 번개 뭐 했어?" 같은 질문이 그 경로다.
 *
 * 승인 대기·거절·취소 건은 뺀다. 대기·거절은 아직 열린 적이 없는 글이고, 취소된 것을 목록에
 * 섞으면 모델이 "있다"고 답한다 — 취소는 없는 것과 같게 다루는 편이 안전하다.
 */
export async function listFlashMeetupsForChatbot(
  db: Db,
  opts: { from?: string; to?: string; limit?: number; now?: Date } = {}
): Promise<FlashChatView[]> {
  const from = opts.from ?? kstToday(opts.now ?? new Date());
  const conds = [inArray(flashMeetups.status, [...CHATBOT_FLASH_STATUSES]), gte(flashMeetups.meetDate, from)];
  if (opts.to) conds.push(lte(flashMeetups.meetDate, opts.to));
  const rows = await db
    .select({
      id: flashMeetups.id,
      title: flashMeetups.title,
      date: flashMeetups.meetDate,
      time: flashMeetups.meetTime,
      place: flashMeetups.place,
      capacity: flashMeetups.capacity,
      details: flashMeetups.details,
      status: flashMeetups.status,
    })
    .from(flashMeetups)
    .where(and(...conds))
    .orderBy(asc(flashMeetups.meetDate), asc(flashMeetups.meetTime))
    .limit(Math.min(opts.limit ?? 10, 30));
  if (rows.length === 0) return [];

  // 확정·대기 인원은 신청 표에서 센다(취소한 사람은 빠진다).
  const counts = new Map<string, { confirmed: number; waiting: number }>();
  const countRows = await db
    .select({ flashId: flashSignups.flashId, status: flashSignups.status, n: sql<number>`count(*)::int` })
    .from(flashSignups)
    .where(and(inArray(flashSignups.flashId, rows.map((r) => r.id)), ne(flashSignups.status, 'canceled')))
    .groupBy(flashSignups.flashId, flashSignups.status);
  for (const c of countRows) {
    const cur = counts.get(c.flashId) ?? { confirmed: 0, waiting: 0 };
    if (c.status === 'confirmed') cur.confirmed = c.n;
    else cur.waiting = c.n;
    counts.set(c.flashId, cur);
  }

  return rows.map((r) => {
    const c = counts.get(r.id) ?? { confirmed: 0, waiting: 0 };
    return {
      title: r.title,
      date: r.date,
      weekday: weekdayOf(r.date),
      time: r.time ? r.time.slice(0, 5) : null,
      place: r.place,
      capacity: r.capacity,
      confirmed: c.confirmed,
      waiting: c.waiting,
      full: r.capacity != null && c.confirmed >= r.capacity,
      acceptingSignups: r.status === 'open',
      details: r.details ? r.details.slice(0, FLASH_DETAILS_MAX_CHARS) : null,
    };
  });
}

// ── Gemini function declarations ───────────────────────────────────────
export const CHATBOT_TOOLS: GeminiTool[] = [
  {
    name: 'list_upcoming_volunteer_sessions',
    description:
      '다가오는(오늘 이후) 봉사 회차 목록을 날짜순으로 가져온다. "이번 주 봉사", "다음 봉사 언제", "앞으로 봉사 일정" 같은 질문에 쓴다. ' +
      '각 회차에는 봉사 집합 시각(meetTime)과 **공지가 카페에 올라가는 시각(upload)** 이 함께 들어 있다. ' +
      '"공지 몇 시에 올라와?", "언제 올라와?" 처럼 업로드 시각을 묻는 질문에도 이 tool 을 쓴다.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: '가져올 최대 회차 수(기본 10)' },
      },
    },
  },
  {
    name: 'get_volunteer_session_detail',
    description:
      '특정 날짜의 봉사 회차 상세(집합 시각·장소·정원·공지 업로드 시각)를 가져온다. 날짜를 특정한 질문에 쓴다.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD 형식 날짜' },
      },
      required: ['date'],
    },
  },
  {
    name: 'get_team_guidebook',
    description:
      '팀 가이드북에서 뽑아 둔 **그 팀의 봉사 운영 정보 요약**(여는 요일·주기, 신청 방법, 공지 방식, 준비물)을 가져온다. ' +
      '**등록된 봉사 회차가 없을 때** 이 tool 을 부른다 — 확정 일정이 없어도 "보통 언제 여는지"는 답할 수 있다. ' +
      '팀별 운영 방식을 묻는 질문("2팀은 언제 봉사해?")에도 쓴다. ' +
      '돌려주는 content 는 **가이드북 전문이 아니라 봉사 운영 정보만 추린 요약**이다. ' +
      '거기 없는 내용(팀 소개·활동 내용·세부 규정 등)은 지어내지 말고 guidebookLink 로 안내한다. ' +
      '여기서 얻은 것은 **평소 방식이지 확정된 일정이 아니다** — 답할 때 반드시 구분해서 말한다.',
    parameters: {
      type: 'object',
      properties: {
        team: { type: 'string', description: '팀 이름(예: "2팀"). 생략하면 질문자가 속한 팀' },
      },
    },
  },
  {
    name: 'list_flash_meetups',
    description:
      '**번개**(부원끼리 즉흥으로 여는 소모임 — 밥·카페·방탈출·산책 등) 목록을 가져온다. ' +
      '"번개 뭐 있어?", "이번 주 번개", "번개 신청 어떻게 해" 같은 질문에 쓴다. ' +
      '기본은 오늘 이후지만 from 에 과거 날짜를 넣으면 **지난 개최 내역**이 된다("저번 달 번개 뭐 했어?"). ' +
      '각 번개에는 날짜(date)·요일(weekday)·집합 시각(time)·장소(place)·정원(capacity)·확정 인원(confirmed)·' +
      '대기 인원(waiting)·세부 내용(details)이 들어 있다. ' +
      'full 이 true 면 정원이 차서 지금 신청하면 대기로 들어간다. acceptingSignups 가 false 면 신청이 마감된 것이다. ' +
      '**개최자와 신청자 이름은 결과에 없다**(개인정보). 누가 여는지 물으면 지어내지 말고 번개 게시판을 안내한다. ' +
      '봉사 회차나 동아리 공식 일정(총회·MT)과 섞지 않는다 — 그건 각각 다른 tool 이다.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: '조회 시작일 YYYY-MM-DD(기본: 오늘)' },
        to: { type: 'string', description: '조회 종료일 YYYY-MM-DD(생략 가능)' },
        limit: { type: 'integer', description: '가져올 최대 번개 수(기본 10)' },
      },
    },
  },
  {
    name: 'list_club_schedules',
    description:
      '봉사 말고 **동아리 일정**(총회·MT·정기회의·행사 등)을 캘린더에서 가져온다. ' +
      '"MT 언제야", "이번 달 무슨 일정 있어", "총회 어디서 해" 처럼 날짜가 있는 동아리 행사 질문에 쓴다. ' +
      '각 일정에는 날짜(startDate)·요일(weekday)·시간(startTime)·장소(place)·세부사항(details)이 들어 있다. ' +
      'endDate 가 있으면 그날까지 이어지는 여러 날 일정이다. startTime 이 없으면 시간이 아직 안 정해진 것이다. ' +
      '기본은 오늘 이후지만, 지난 일정을 물으면 from 에 과거 날짜를 넣어 조회한다.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: '조회 시작일 YYYY-MM-DD(기본: 오늘)' },
        to: { type: 'string', description: '조회 종료일 YYYY-MM-DD(생략 가능)' },
        limit: { type: 'integer', description: '가져올 최대 일정 수(기본 15)' },
      },
    },
  },
];

/**
 * 등록된 회차가 하나도 없을 때 tool 결과에 함께 실어 보내는 안내 뭉치.
 *
 * **비대칭이 핵심이다.** 회차가 있을 때는 이 값을 보내지 않는다 — 답할 때마다 "카페도 확인하세요"가
 * 붙으면 답이 지저분해지고, 정확한 답까지 의심스럽게 들린다. 비어 있을 때만 붙인다.
 *
 * 왜 이 값을 tool 결과에 싣나: 시스템 프롬프트에 규칙을 적어도 **팀 이름·안내 문구 같은 사실**은
 * 그때그때 DB 에서 와야 한다. 사실은 여기로, 규칙은 시스템 프롬프트로 나눠 둔다.
 */
async function noSessionGuidance(db: Db, actor: Actor): Promise<Record<string, unknown>> {
  const [myTeams, withGuidebook, fallbackNotice] = await Promise.all([
    actorTeamNames(db, actor),
    teamsWithGuidebook(db),
    getVolunteerFallback(db),
  ]);
  return {
    askerTeams: myTeams,
    teamsWithGuidebook: withGuidebook,
    fallbackNotice,
    guidebookLink: GUIDEBOOK_PAGE_PATH,
    // 이 문장은 우리 서버가 만든 것이지 사용자가 넣은 값이 아니다(인젝션 경계 밖).
    // 모델이 지금 무엇을 해야 하는지 그 자리에서 알려 주는 것이 가장 확실하다.
    note:
      '등록된 봉사 회차가 없다. 여기서 멈추지 말고 get_team_guidebook 으로 그 팀의 평소 운영 방식을 확인해 답하라. ' +
      '가이드북에도 없으면 fallbackNotice 를 그대로 안내하라. 어느 쪽이든 확정 일정이 아님을 밝혀라.',
  };
}

/**
 * 모델이 호출한 tool 을 실행하고 결과 객체를 돌려준다(모델에 functionResponse 로 되돌린다).
 *
 * `actor` 를 받는 이유: 동아리 일정은 **질문자 역할 이하 등급만** 보여야 한다(규칙 #3).
 * 봉사 회차(events)는 부원 이상 전원 공개라 필터가 없지만, 일정은 운영진 전용이 섞이므로
 * 조회 자체를 질문자 기준으로 건다.
 */
export async function executeTool(
  db: Db,
  actor: Actor,
  name: string,
  args: Record<string, unknown>,
  now: Date = new Date()
): Promise<Record<string, unknown>> {
  if (name === 'list_upcoming_volunteer_sessions') {
    const limit = typeof args.limit === 'number' ? args.limit : undefined;
    const sessions = await listUpcomingSessions(db, { limit, now });
    if (sessions.length > 0) return { sessions, count: sessions.length };
    return { sessions, count: 0, noSessions: await noSessionGuidance(db, actor) };
  }
  if (name === 'get_volunteer_session_detail') {
    const date = String(args.date ?? '');
    const sessions = await getSessionsOnDate(db, date, now);
    if (sessions.length > 0) return { date, sessions, count: sessions.length };
    return { date, sessions, count: 0, noSessions: await noSessionGuidance(db, actor) };
  }
  if (name === 'get_team_guidebook') {
    // 팀을 안 밝히면 질문자 팀으로 본다. 여러 팀이면 첫 번째(활동팀은 보통 하나다).
    const asked = typeof args.team === 'string' ? args.team.trim() : '';
    const team = asked || (await actorTeamNames(db, actor))[0] || '';
    if (!team) {
      return { found: false, reason: '어느 팀인지 알 수 없다. 질문자에게 팀을 물어보라.', teamsWithGuidebook: await teamsWithGuidebook(db) };
    }
    const out = await getTeamGuidebook(db, team);
    if (out.found) return { ...out };
    // 요약이 없어도 **파일은 있을 수 있다**(추출 실패, 확인 대기). 그때는 원문 링크로 안내한다.
    const files = await teamsWithGuidebookFile(db);
    return {
      ...out,
      guidebookLink: files.includes(team) ? GUIDEBOOK_PAGE_PATH : null,
      teamsWithGuidebook: await teamsWithGuidebook(db),
    };
  }
  if (name === 'list_flash_meetups') {
    const from = asDate(args.from) ?? kstToday(now); // 기본은 오늘 이후 — 지난 것을 묻지 않는 한 소용없다
    const to = asDate(args.to);
    const limit = typeof args.limit === 'number' ? args.limit : undefined;
    const flash = await listFlashMeetupsForChatbot(db, { from, to, limit, now });
    return {
      from,
      to: to ?? null,
      flash,
      count: flash.length,
      flashLink: FLASH_PAGE_PATH,
      // 이 문장은 우리 서버가 만든 것이지 사용자가 넣은 값이 아니다(인젝션 경계 밖).
      // 비어 있을 때만 붙인다 — 있을 때도 붙이면 정확한 답까지 변명처럼 들린다(봉사 tool 과 같은 판단).
      ...(flash.length === 0
        ? { note: '해당 기간에 올라온 번개가 없다. 없다고 답하되, 번개는 부원 누구나 열 수 있고 게시판(flashLink)에서 개최를 낼 수 있다고 덧붙여라.' }
        : {}),
    };
  }
  if (name === 'list_club_schedules') {
    const from = asDate(args.from) ?? kstToday(now); // 기본은 오늘 이후 — 지난 일정을 묻지 않는 한 소용없다
    const to = asDate(args.to);
    const limit = typeof args.limit === 'number' ? Math.min(args.limit, 50) : 15;
    const rows = await listSchedules(db, actor, { from, to, limit });
    return { from, to: to ?? null, schedules: rows.map(toChatbotView), count: rows.length };
  }
  return { error: `알 수 없는 tool: ${name}` };
}

/** 모델이 넣은 날짜 인자 정리 — 형식이 틀리면 무시한다(조건 없이 넘기면 SQL 이 빈 결과를 낸다). */
function asDate(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}
