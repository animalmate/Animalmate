// 공지 템플릿 플레이스홀더 값 생성.
//  {{간결_날짜}}  → 07/23 목요일
//  {{전체_날짜}}  → 2026년 7월 23일 목요일
//  {{집합시간}}   → 14:00
//  {{팀장단}}     → 여러 줄(직함 이름 전화)
import type { TeamLeader } from '@/db/schema';

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

/** 'YYYY-MM-DD' → 간결_날짜/전체_날짜. 잘못된 값이면 빈 객체. */
export function dateVars(dateStr: string | null | undefined): Record<string, string> {
  if (!dateStr) return {};
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return {};
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const wd = WEEKDAY[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()]!;
  return {
    // 요일이 없으면 "07/23" 만 보고 무슨 요일인지 알 수 없어 공지로 쓰기 불편하다.
    간결_날짜: `${String(mo).padStart(2, '0')}/${String(d).padStart(2, '0')} ${wd}요일`,
    전체_날짜: `${y}년 ${mo}월 ${d}일 ${wd}요일`,
  };
}

/** KST 기준 Date → 'YYYY-MM-DD'. */
export function kstDateStr(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, '0')}-${String(k.getUTCDate()).padStart(2, '0')}`;
}

/** 팀장단 명단 → "팀장 홍길동 010-…\n부팀장 …". 비어 있으면 빈 문자열. */
export function leadersBlock(leaders: TeamLeader[] | null | undefined): string {
  if (!leaders || leaders.length === 0) return '';
  return leaders
    .map((l) => [l.label, l.name, l.phone].filter((s) => s && s.trim()).join(' ').trim())
    .filter(Boolean)
    .join('\n');
}
