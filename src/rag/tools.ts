// 챗봇 상태형 질의 tool — events(봉사 회차) 기반. "다가오는 봉사 목록" / "특정 날짜 회차 상세".
//
// RAG(문서 검색)는 "규정·안내" 같은 정적 지식에 답하고, 이 tool 은 "이번 주 봉사 어디야?" 처럼
// **지금 DB 상태**를 물을 때 쓴다. 모델이 스스로 판단해 호출한다(function calling).
// 봉사 정보(일시·장소·정원)는 부원 이상 전원 공개라 역할 필터 없이 조회한다.

import { and, asc, gte, ne, eq } from 'drizzle-orm';
import type { Db } from '@/db/types';
import { events, teams } from '@/db/schema';
import type { GeminiTool } from './gemini';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** KST 기준 오늘 날짜(YYYY-MM-DD). event_date 는 date 타입이라 문자열로 비교한다. */
function kstToday(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}
function weekdayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  return WEEKDAYS[d.getUTCDay()] ?? '';
}

export interface SessionView {
  date: string; // YYYY-MM-DD
  weekday: string; // 요일
  time: string | null; // 집합 시각 HH:MM
  place: string | null;
  capacity: number | null;
  team: string;
  title: string;
}

function toView(r: { eventDate: string | null; meetTime: string | null; place: string | null; capacity: number | null; team: string | null; title: string }): SessionView {
  const date = r.eventDate ?? '';
  return {
    date,
    weekday: date ? weekdayOf(date) : '',
    time: r.meetTime ? r.meetTime.slice(0, 5) : null,
    place: r.place,
    capacity: r.capacity,
    team: r.team ?? '',
    title: r.title,
  };
}

/** 다가오는 봉사 회차(오늘 이후, 취소 제외). 날짜 오름차순. */
export async function listUpcomingSessions(db: Db, opts: { limit?: number; now?: Date } = {}): Promise<SessionView[]> {
  const now = opts.now ?? new Date();
  const today = kstToday(now);
  const rows = await db
    .select({ eventDate: events.eventDate, meetTime: events.meetTime, place: events.place, capacity: events.capacity, team: teams.name, title: events.title })
    .from(events)
    .leftJoin(teams, eq(teams.id, events.teamId))
    .where(and(gte(events.eventDate, today), ne(events.status, 'canceled')))
    .orderBy(asc(events.eventDate))
    .limit(Math.min(opts.limit ?? 10, 20));
  return rows.map(toView);
}

/** 특정 날짜의 봉사 회차 상세(여러 팀이 같은 날이면 여러 건). */
export async function getSessionsOnDate(db: Db, dateStr: string, now: Date = new Date()): Promise<SessionView[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return [];
  void now;
  const rows = await db
    .select({ eventDate: events.eventDate, meetTime: events.meetTime, place: events.place, capacity: events.capacity, team: teams.name, title: events.title })
    .from(events)
    .leftJoin(teams, eq(teams.id, events.teamId))
    .where(and(eq(events.eventDate, dateStr), ne(events.status, 'canceled')))
    .orderBy(asc(events.meetTime));
  return rows.map(toView);
}

// ── Gemini function declarations ───────────────────────────────────────
export const CHATBOT_TOOLS: GeminiTool[] = [
  {
    name: 'list_upcoming_volunteer_sessions',
    description: '다가오는(오늘 이후) 봉사 회차 목록을 날짜순으로 가져온다. "이번 주 봉사", "다음 봉사 언제", "앞으로 봉사 일정" 같은 질문에 쓴다.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: '가져올 최대 회차 수(기본 10)' },
      },
    },
  },
  {
    name: 'get_volunteer_session_detail',
    description: '특정 날짜의 봉사 회차 상세(집합 시각·장소·정원)를 가져온다. 날짜를 특정한 질문에 쓴다.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD 형식 날짜' },
      },
      required: ['date'],
    },
  },
];

/** 모델이 호출한 tool 을 실행하고 결과 객체를 돌려준다(모델에 functionResponse 로 되돌린다). */
export async function executeTool(db: Db, name: string, args: Record<string, unknown>, now: Date = new Date()): Promise<Record<string, unknown>> {
  if (name === 'list_upcoming_volunteer_sessions') {
    const limit = typeof args.limit === 'number' ? args.limit : undefined;
    const sessions = await listUpcomingSessions(db, { limit, now });
    return { sessions, count: sessions.length };
  }
  if (name === 'get_volunteer_session_detail') {
    const date = String(args.date ?? '');
    const sessions = await getSessionsOnDate(db, date, now);
    return { date, sessions, count: sessions.length };
  }
  return { error: `알 수 없는 tool: ${name}` };
}
