// 일정 행 → 화면·챗봇이 함께 쓰는 표현.
//
// 한 곳에서 만드는 이유: 캘린더 화면과 챗봇이 **같은 일정을 다르게 말하면** 사람이 혼란스럽다.
// (날짜·요일·시간 표기가 화면과 챗봇 답변에서 어긋나는 것이 그 형태다.)

import { weekdayOf } from '@/lib/kst-date';
import type { Visibility } from '@/auth/visibility';
import type { Schedule } from './schedules';

export interface ScheduleView {
  id: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string | null; // null = 하루짜리
  weekday: string; // 시작일 요일(모델이 직접 계산하지 않게 미리 준다)
  startTime: string | null; // HH:MM, null = 시간 미정
  place: string | null;
  details: string | null;
  visibility: Visibility;
  updatedAt: string;
}

export function toScheduleView(row: Schedule): ScheduleView {
  return {
    id: row.id,
    title: row.title,
    startDate: row.startDate,
    endDate: row.endDate,
    weekday: weekdayOf(row.startDate),
    startTime: row.startTime ? row.startTime.slice(0, 5) : null, // DB 는 'HH:MM:SS' 로 돌려준다
    place: row.place,
    details: row.details,
    visibility: row.visibility,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * 챗봇에게 주는 형태. **visibility 와 updatedAt 은 뺀다** — 모델이 "이건 운영진 공개 자료입니다"
 * 같은 말을 답변에 섞을 이유가 없다(무엇이 걸러졌는지는 질문자가 알 바가 아니다).
 * 걸러내는 일은 이미 SQL WHERE 에서 끝났다.
 */
export function toChatbotView(row: Schedule): Omit<ScheduleView, 'visibility' | 'updatedAt' | 'id'> {
  const { id: _id, visibility: _v, updatedAt: _u, ...rest } = toScheduleView(row);
  return rest;
}
