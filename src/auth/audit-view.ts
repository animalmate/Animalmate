// 감사 기록을 **사람이 읽는 형태로** 옮기는 순수 모듈(부수효과·DB 접근 없음).
//
// `audit.ts` 가 쓰는 쪽이라면 여기는 읽는 쪽이다. 규칙 #4 는 모든 관리 행위를 남기라고 하는데,
// 그동안 읽는 수단이 `psql` 뿐이었다 — 남기기만 하고 아무도 못 보는 기록이었다.
//
// 판정을 순수 함수로 빼는 이유는 늘 같다: 화면·API·테스트가 **같은 하나**를 보게 하기 위해서다
// (결정 142 — 핸드오프 판정이 두 곳에 있다가 집계가 틀어졌다).

export interface ParsedAction {
  /** 표시 마크를 걷어낸 순수 행위 이름. 예: `membership.set_role` */
  base: string;
  /** 회장단 대상 권한 변경처럼 "사후에 반드시 보여야 하는" 행위 — `audit.ts` 가 붙인다. */
  high: boolean;
  /** 회장단이 소유권을 건너뛰고 고친 경우. */
  override: boolean;
}

/**
 * `action` 컬럼은 `"membership.set_role [high]"` 처럼 **마크가 문자열에 붙어** 저장된다
 * (`buildAuditEntry`). 컬럼을 따로 두지 않은 설계라 읽는 쪽에서 다시 떼어내야 한다.
 */
export function parseAction(action: string): ParsedAction {
  const high = action.includes('[high]');
  const override = action.includes('[override]');
  const base = action.replace(/\[(high|override)\]/g, '').trim();
  return { base, high, override };
}

/** 사람이 아니라 크론이 남긴 기록인가. */
export function isAutomated(action: string): boolean {
  const { base } = parseAction(action);
  return base.startsWith('cron.') || base.startsWith('batch.');
}

/** 대분류(필터용). `recruit.applicant.bulkStatus` → `recruit` */
export function actionGroup(action: string): string {
  return parseAction(action).base.split('.')[0] ?? '';
}

/**
 * 필터 드롭다운에 나오는 대분류. 순서는 **자주 찾는 것부터**다 — 사고를 조사하러 들어오는
 * 화면이라 회원·모집이 위에 있어야 한다. `cron` 은 87%(11,324/12,988)를 차지하지만 사람이
 * 찾는 것이 아니므로 맨 아래다.
 */
export const AUDIT_GROUPS: { key: string; label: string }[] = [
  { key: 'membership', label: '회원 역할' },
  { key: 'recruit', label: '신입 모집' },
  { key: 'team', label: '팀' },
  { key: 'document', label: '문서' },
  { key: 'post', label: '공지 예약' },
  { key: 'template', label: '양식' },
  { key: 'schedule', label: '일정' },
  { key: 'event', label: '봉사 회차' },
  { key: 'guidebook', label: '가이드북' },
  { key: 'board', label: '게시판' },
  { key: 'joincode', label: '가입코드' },
  { key: 'session', label: '세션' },
  { key: 'settings', label: '설정' },
  { key: 'cron', label: '자동 작업' },
  { key: 'batch', label: '자동 작업(옛 일괄 생성)' },
];

/**
 * 행위 이름 → 한국어. **모르는 행위는 원문 그대로 보여 준다** — 빈칸이나 "알 수 없음"으로
 * 덮으면 새 기능이 남긴 기록이 화면에서 사라진 것처럼 보인다(코드가 늘 이 표보다 앞선다).
 */
export const ACTION_LABEL: Record<string, string> = {
  'cron.publish': '자동 발행 워커',
  'cron.readiness_check': '자동 미완성 점검',
  'cron.term_expiry': '자동 만료 점검',
  'batch.generate_draft': '초안 일괄 생성(폐기된 기능)',

  'post.create': '공지 예약 만듦',
  'post.update': '공지 예약 고침',
  'post.modify': '공지 내용 고침',
  'post.schedule': '공지 발행 시각 정함',
  'post.ready': '공지 완성 처리',
  'post.cancel': '공지 예약 취소',
  'post.retry': '공지 발행 재시도',
  'post.published': '공지 카페 발행됨',
  'post.blocked': '공지 발행 보류(빈 항목)',
  'post.rate_limited': '카페 연속 등록 제한(code 999)',

  'template.create': '양식 만듦',
  'template.update': '양식 고침',
  'template.delete': '양식 지움',

  'document.create': '문서 올림',
  'document.update': '문서 고침',
  'document.delete': '문서 지움',
  'document.reindex': '문서 재색인(내용 그대로)',
  'guidebook.upload': '가이드북 올림',
  'guidebook.delete': '가이드북 지움',
  'guidebook.document.create': '가이드북 본문 챗봇 반영',
  'guidebook.document.update': '가이드북 본문 갱신',

  'board.create': '게시판 등록',
  'board.update': '게시판 고침',
  'board.delete': '게시판 내림',

  'team.create': '팀 만듦',
  'team.delete': '팀 지움',
  'team.set_user_teams': '소속 팀 지정',
  'team.set_manual_leaders': '팀장단(미가입자) 지정',
  'team.set_roster': '팀 명단 지정',
  'team.noticeEditing.grant': '공고 편집 권한 켬/끔',

  'membership.promote': '역할 올림',
  'membership.demote': '역할 내림',
  'membership.set_role': '역할 지정',
  'membership.manage': '회원 정보 관리',
  'membership.expire': '미접속 자동 만료',

  'joincode.issue': '가입코드 발급',
  'session.revoke_all': '세션 전부 끊음',
  'settings.update': '설정 바꿈',

  'schedule.create': '일정 등록',
  'schedule.update': '일정 고침',
  'schedule.delete': '일정 지움',
  'event.cancel': '봉사 취소 표시',

  'recruit.cohort.create': '기수 만듦',
  'recruit.cohort.delete': '기수 지움',
  'recruit.cohort.closeSwitch': '모집 마감 스위치',
  'recruit.cohort.publicSwitch': '지원자 공개 스위치',
  'recruit.applicant.status': '지원자 상태 바꿈',
  'recruit.applicant.bulkStatus': '지원자 상태 일괄 확정',
  'recruit.applicant.bulkTeam': '지원자 팀 일괄 배정',
  'recruit.applicant.attendance': '면접 참석/불참 표시',
  'recruit.applicant.assignSlot': '면접 자리 배정',
  'recruit.applicant.assignSlotBulk': '면접 자리 일괄 배정',
  'recruit.applicant.reviewMark': '최종 검토 표시',
  'recruit.applicant.resubmit': '지원서 재제출로 교체',
  'recruit.applicant.statusRepair': '지원자 상태 바로잡음',
  'recruit.slot.create': '면접 슬롯 만듦',
  'recruit.slot.createPanel': '면접 조 만듦',
  'recruit.slot.delete': '면접 슬롯 지움',
  'recruit.slot.interviewer.add': '면접관 배정',
  'recruit.slot.interviewer.fill': '면접관 채움',
  'recruit.slot.interviewer.remove': '면접관 뺌',
  'recruit.resultMail.queue': '결과 안내 메일 발송 걺',
  'recruit.purge': '지원자 자료 폐기',
};

export function describeAction(action: string): string {
  const { base } = parseAction(action);
  return ACTION_LABEL[base] ?? base;
}

/**
 * 목록 이어보기용 커서. `created_at` 하나로는 같은 시각 기록이 여러 건일 때(일괄 처리에서
 * 흔하다) 경계에서 빠지거나 겹친다 — `id` 를 함께 실어 **(시각, id) 순서쌍**으로 자른다.
 */
export function encodeCursor(at: Date, id: string): string {
  return `${at.toISOString()}|${id}`;
}

export function parseCursor(raw: string | null | undefined): { at: Date; id: string } | null {
  if (!raw) return null;
  const i = raw.indexOf('|');
  if (i <= 0) return null;
  const at = new Date(raw.slice(0, i));
  const id = raw.slice(i + 1);
  if (Number.isNaN(at.getTime()) || !id) return null;
  return { at, id };
}
