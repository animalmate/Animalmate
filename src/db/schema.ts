// 03-DATA-MODEL.md 를 Drizzle 스키마로 인코딩한다.
// 스키마를 바꾸면 03-DATA-MODEL.md 를 같은 커밋에서 갱신할 것(CLAUDE.md 코드 컨벤션).
//
// 규칙 반영:
//  - RLS 는 마이그레이션에서 전 테이블 활성화(정책 미부여 = 기본 거부, 규칙 #8). 여기서는 테이블만 정의.
//  - 데이터 접근은 서버(service role) 경유. 브라우저에서 직접 쿼리 금지.
//  - 조직 수치(팀 수/인원)는 전부 데이터 → 상수 하드코딩 금지(PRD §4, 핵심 설계 결정 6).

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  smallint,
  numeric,
  boolean,
  timestamp,
  date,
  time,
  jsonb,
  vector,
  unique,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// pgvector 임베딩 차원 — **768 확정**(2026-07-24 실측, 07-DECISIONS 15).
// gemini-embedding-2 는 기본 3072차원을 내지만, 3072 는 pgvector HNSW 한도(2000)를 넘어 인덱스가 불가하다.
// → 임베딩 호출 시 반드시 outputDimensionality=768 을 지정한다(Matryoshka 축소, 정규화된 채로 반환).
// 값이 바뀌면 컬럼 재생성 마이그레이션 + **전 문서 재임베딩**이 함께 가야 한다.
const EMBEDDING_DIM = 768;

// ── enum (03 enum 정의) ────────────────────────────────────────────────
export const roleEnum = pgEnum('role', ['member', 'staff', 'board', 'sysadmin']);
export const boardPositionEnum = pgEnum('board_position', [
  'president',
  'vice_president',
  'treasurer',
]);
export const ownerTypeEnum = pgEnum('owner_type', ['personal', 'team', 'global']);
export const visibilityEnum = pgEnum('visibility', ['member', 'staff', 'board']);
export const postStatusEnum = pgEnum('post_status', [
  'draft',
  'ready',
  'scheduled',
  'published',
  'failed',
]);
// 신청 기능 폐기로 단순화(결정 2026-07-23): draft → published → done | canceled.
export const eventStatusEnum = pgEnum('event_status', ['draft', 'published', 'done', 'canceled']);
// enum 정의에 없지만 03 본문에서 쓰는 보조 enum
export const membershipStatusEnum = pgEnum('membership_status', ['active', 'expired']);
export const teamKindEnum = pgEnum('team_kind', ['activity', 'functional']);
export const teamPositionEnum = pgEnum('team_position', ['leader', 'member']);
export const naverTokenStatusEnum = pgEnum('naver_token_status', ['ok', 'error']);
export const monthWeekEnum = pgEnum('month_week', ['1', '2', '3', '4', 'last']);
// F9 신입 모집 지원자 상태(스펙 2026-07-25). 접수 → 서류합격|서류불합격 → 면접완료 → 최종합격|최종불합격.
// 면접완료 = 면접 점수가 1개라도 저장되면 자동 전환(사실 반영), 점수가 0개로 돌아가면 서류합격으로 자동 복귀.
// 면접불참(interview_noshow) = 배정됐으나 면접을 못 본 사람을 회장단이 수동 표시(면접 기록 없음과 구분).
export const recruitStatusEnum = pgEnum('recruit_status', [
  'received',
  'doc_fail',
  'doc_pass',
  'interview_done',
  'interview_noshow',
  'final_pass',
  'final_fail',
]);
export const recruitScoreStageEnum = pgEnum('recruit_score_stage', ['document', 'interview']);

// ── 조직/계정 ──────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  // 연락처(가입 시 입력, 본인 수정 가능). 봉사 공지 {{팀장단}} 표시에 쓰인다(팀장단 배정된 계정).
  // PII 이므로 RAG 인덱스에 넣지 않는다(규칙 #5). 없을 수 있음(기존 계정·미입력).
  phone: text('phone'),
  /**
   * 세션 세대 번호. 발급된 JWT 에 이 값을 넣고 요청마다 DB 값과 대조한다(불일치 = 401).
   * 값을 1 올리면 그 계정의 **모든 기기 세션이 즉시 무효**가 된다(기기 분실·계정 양도·유출 대응).
   * 세션 테이블 없이 무효화를 얻는 방법 — 권한을 어차피 매 요청 DB 에서 읽으므로(loadActor)
   * 같은 SELECT 에 컬럼 하나를 얹는 것이라 추가 조회 비용이 없다.
   */
  sessionVersion: integer('session_version').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable('memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: roleEnum('role').notNull(),
  boardPosition: boardPositionEnum('board_position'), // 회장단일 때만
  termStart: date('term_start').notNull(),
  termEnd: date('term_end').notNull(), // 크론이 경과 건을 expired 로 강등(규칙 임기 자동 만료)
  status: membershipStatusEnum('status').notNull().default('active'),
});

/** 팀장단 1인(공지에 삽입되는 연락처 + 관리 권한 계정). 개인정보 — 런타임 입력이며 코드/시드에 넣지 않는다(규칙 #4). */
// teams.leaders = 봉사 공지 {{팀장단}}에 덧붙는 "미가입자 수동 항목"(이름·전화만 있는 사람).
// 가입 계정 팀장단은 team_members(position=leader)로 관리하고 여기 두지 않는다. 표시 순서상 자동 명단 뒤에 붙는다.
export interface TeamLeader {
  label: string; // 팀장 / 부팀장 등
  name: string;
  phone: string;
}

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  kind: teamKindEnum('kind').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  // 매 학기 교체되는 팀장단 명단(공지 {{팀장단}} 자동 삽입용).
  leaders: jsonb('leaders').$type<TeamLeader[]>().notNull().default(sql`'[]'::jsonb`),
});

export const teamMembers = pgTable(
  'team_members',
  {
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    position: teamPositionEnum('position').notNull(), // leader = 팀장단(공지 {{팀장단}} 노출) / member = 관리만
    // 공지 {{팀장단}}에 붙는 직함(팀장/부팀장 등). leader 일 때만 의미. 없으면 직함 없이 이름·전화만.
    label: text('label'),
  },
  (t) => [unique('team_members_team_user_uq').on(t.teamId, t.userId)]
);

export const invites = pgTable('invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  targetRole: roleEnum('target_role').notNull(),
  targetTeam: uuid('target_team').references(() => teams.id, { onDelete: 'set null' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  invitedBy: uuid('invited_by')
    .notNull()
    .references(() => users.id),
});

// ── 카페 연동 ──────────────────────────────────────────────────────────
// boards: 게시판 레지스트리. menuid 는 카페 게시판 번호(하드코딩 금지 — 여기서 조회).
export const boards = pgTable('boards', {
  menuid: integer('menuid').primaryKey(),
  name: text('name').notNull(),
  purpose: text('purpose'),
  botCanWrite: boolean('bot_can_write').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
});

export const naverTokens = pgTable('naver_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  refreshTokenEncrypted: text('refresh_token_encrypted').notNull(),
  lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
  status: naverTokenStatusEnum('status').notNull().default('ok'),
});

export const scheduledPosts = pgTable(
  'scheduled_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerType: ownerTypeEnum('owner_type').notNull(),
    ownerId: uuid('owner_id').notNull(), // 다형성(personal=user, team=team) — FK 없음
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id),
    boardMenuid: integer('board_menuid')
      .notNull()
      .references(() => boards.menuid),
    // 봉사 회차 연결(post→event 다대일). 봉사 외 일반 공지(총회 등)는 null.
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    contentMd: text('content_md').notNull(),
    imageUrls: text('image_urls').array(),
    publishAt: timestamp('publish_at', { withTimezone: true }),
    status: postStatusEnum('status').notNull().default('draft'),
    cafeArticleUrl: text('cafe_article_url'),
    failReason: text('fail_reason'),
    retryCount: integer('retry_count').notNull().default(0),
    approvedBy: uuid('approved_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('scheduled_posts_due_idx').on(t.status, t.publishAt)]
);

// ── 봉사 워크플로 ──────────────────────────────────────────────────────
// 발행 양식(템플릿). 팀 소유·개인 소유·global(공용) 셋. global 은 owner_id=null, 편집=회장단만.
export const postTemplates = pgTable('post_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerType: ownerTypeEnum('owner_type').notNull(), // personal | team | global
  ownerId: uuid('owner_id'), // global 이면 null
  name: text('name').notNull(),
  titleTemplate: text('title_template').notNull(), // {{간결_날짜}} {{전체_날짜}} {{집합시간}} {{팀장단}} {{장소}} {{정원}}
  bodyTemplate: text('body_template').notNull(),
  // 장소별 양식용 기본값(예: "양주 쉼터 봉사" 양식 → 항상 양주 쉼터/정원 20/집합 10:00/업로드 20:00).
  // 예약을 만들 때 각 일정 행에 미리 채워지고(회차별로 고칠 수 있다), place/capacity 는 events 초기값이 된다.
  // 덕분에 예약할 때 실제로 고르는 건 봉사 일자와 업로드 날짜뿐이다.
  defaultPlace: text('default_place'),
  defaultCapacity: integer('default_capacity'),
  defaultMeetTime: time('default_meet_time'), // 봉사 집합 시간
  defaultPublishTime: time('default_publish_time'), // 카페 업로드 시각
  updatedBy: uuid('updated_by')
    .notNull()
    .references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// recurring_rules: **미사용(2026-07-24)**. 일괄 생성 기능을 없애면서 이 테이블을 읽고 쓰는 코드도 전부 제거했다.
// (정기 봉사가 "매월 첫째 주 토요일"처럼 고정되는 경우가 드물어 새 예약에서 회차를 직접 넣는 편이 낫다.)
// 테이블은 데이터 보존을 위해 남겨 둔다 — 다시 쓸 일이 없다고 확정되면 DROP 마이그레이션으로 정리할 것.
export const recurringRules = pgTable('recurring_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  monthWeek: monthWeekEnum('month_week').notNull(), // 매월 N번째(1~4|last)
  weekday: smallint('weekday').notNull(), // 0=일 … 6=토
  time: time('time').notNull(), // 봉사 집합시간(event.meet_time 의 원천)
  boardMenuid: integer('board_menuid')
    .notNull()
    .references(() => boards.menuid),
  templateId: uuid('template_id').references(() => postTemplates.id, { onDelete: 'set null' }),
  noticeLeadDays: integer('notice_lead_days').notNull().default(7), // 봉사일 - N일 = 발행일
  publishTime: time('publish_time').notNull().default('20:00'), // 발행 시각
  isActive: boolean('is_active').notNull().default(true),
});

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  ruleId: uuid('rule_id').references(() => recurringRules.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  eventDate: date('event_date'),
  meetTime: time('meet_time'),
  place: text('place'),
  capacity: integer('capacity'),
  status: eventStatusEnum('status').notNull().default('draft'),
  // 공지 발행용 회차 데이터 = 예약 폼과 통합(일시/장소/정원 = 챗봇 상태질의 원천).
  // post→event 연결은 scheduled_posts.event_id 로 통일(events.scheduled_post_id 제거).
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// 미완성 점검 알림 발송 기록(중복 방지). 같은 예약글에 같은 날 중복 알림 금지.
export const noticeCheckLog = pgTable(
  'notice_check_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scheduledPostId: uuid('scheduled_post_id')
      .notNull()
      .references(() => scheduledPosts.id, { onDelete: 'cascade' }),
    noticeDate: date('notice_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('notice_check_uq').on(t.scheduledPostId, t.noticeDate)]
);

// ── RAG/챗봇 ───────────────────────────────────────────────────────────
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  contentMd: text('content_md').notNull(),
  visibility: visibilityEnum('visibility').notNull().default('member'),
  ownerType: ownerTypeEnum('owner_type').notNull(),
  ownerId: uuid('owner_id').notNull(), // 다형성(personal=user, team=team)
  updatedBy: uuid('updated_by')
    .notNull()
    .references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  piiChecked: boolean('pii_checked').notNull().default(false), // PII 감지 시 확인 요구(규칙 #5)
});

export const docChunks = pgTable(
  'doc_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIM }),
  },
  (t) => [
    unique('doc_chunks_doc_idx_uq').on(t.documentId, t.chunkIndex),
    // 임베딩 근접 검색용 HNSW 인덱스(cosine). visibility 필터는 검색 SQL 에서 조인으로 강제.
    index('doc_chunks_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  ]
);

export const chatLogs = pgTable('chat_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  roleAtTime: roleEnum('role_at_time').notNull(), // 질의 시점 역할(visibility 필터 근거)
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  sources: text('sources').array(), // 출처 문서명
  handedOff: boolean('handed_off').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── 인증(가입코드 + 이메일 OTP) ───────────────────────────────────────
// 부원 가입 = 학기별 가입코드(활성 코드 항상 1개) + 이메일 6자리 OTP. 로그인 = 이메일 OTP.
export const emailCodePurposeEnum = pgEnum('email_code_purpose', ['signup', 'login']);

export const joinCodes = pgTable(
  'join_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    semesterLabel: text('semester_label').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // 활성 코드는 항상 1개(부분 유니크 인덱스 — is_active=true 인 행이 최대 1개).
  (t) => [uniqueIndex('join_codes_single_active').on(t.isActive).where(sql`${t.isActive}`)]
);

export const emailCodes = pgTable(
  'email_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    codeHash: text('code_hash').notNull(), // OTP 평문 저장 금지 — 해시만
    purpose: emailCodePurposeEnum('purpose').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('email_codes_email_purpose_idx').on(t.email, t.purpose)]
);

/**
 * 레이트 리밋 카운터(고정 윈도). 인증 전 엔드포인트(가입/로그인 요청·검증)를 보호한다.
 *
 * 왜 DB 인가: Vercel 서버리스는 인스턴스가 요청마다 바뀔 수 있어 메모리 카운터는 사실상 무력하다.
 * (bucket, identifier, window_start) 한 행에 원자적 UPSERT 로 세면 인스턴스가 몇 개든 합산된다.
 * 지난 윈도 행은 일일 크론이 정리한다(pruneRateLimits).
 */
export const rateLimits = pgTable(
  'rate_limits',
  {
    bucket: text('bucket').notNull(), // 보호 대상 이름(예: 'signup_request')
    identifier: text('identifier').notNull(), // IP 또는 이메일 등 주체 식별자
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [
    uniqueIndex('rate_limits_pk').on(t.bucket, t.identifier, t.windowStart),
    index('rate_limits_window_idx').on(t.windowStart), // 오래된 행 정리용
  ]
);

/**
 * 앱 설정(key-value) — 회장단이 콘솔에서 바꾸는 운영 파라미터. 상수 하드코딩 대신 여기 둔다(결정 3).
 * 현재 용도: 챗봇 쿼터(인당 일일·전역 분기 상한)와 챗봇 on/off 킬스위치.
 * value_json 으로 숫자·불리언·객체 무엇이든 담는다. 없으면 코드의 기본값을 쓴다.
 */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  valueJson: jsonb('value_json').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── 운영 공통 ──────────────────────────────────────────────────────────
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  targetTable: text('target_table').notNull(),
  targetId: text('target_id'),
  beforeJson: jsonb('before_json'),
  afterJson: jsonb('after_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── F9 신입 모집 (지원자 = 비부원, PII 최소화·보관 제한. 결정 #7 번복 2026-07-25, 07-DECISIONS) ──
// 규칙: 지원자 데이터·자기소개서는 RAG 인덱스 반입 금지(규칙 #5). 열람=운영진 이상, export=회장단만+audit.
// 모집 종료 시 cohort 단위 일괄 hard delete(익명 집계만 잔존, recruit_cohorts.archived_stats).
// 주소는 저장하지 않고 "가장 가까운 역 명"(near_station)만 둔다(사용자 지시 — PII 최소화).

// 기수(cohort). 공개 스위치 2개(면접 일정 / 최종 결과)를 회장단이 조작한다.
export const recruitCohorts = pgTable('recruit_cohorts', {
  id: uuid('id').primaryKey().defaultRandom(),
  label: text('label').notNull().unique(), // 예: "2026-2 신입"
  schedulePublic: boolean('schedule_public').notNull().default(false), // 면접 일정·링크 조회 공개
  resultPublic: boolean('result_public').notNull().default(false), // 최종 결과 조회 공개
  // 폐기(hard delete) 시각 + 그때 남기는 익명 집계(지원자 수·합격자 수·평균 점수). 폐기 전엔 null.
  closedAt: timestamp('closed_at', { withTimezone: true }),
  archivedStats: jsonb('archived_stats'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// 면접 슬롯(날짜×시간 격자). 기본 20분, 링크는 슬롯 단위(지원자 개인 링크가 있으면 그게 우선).
export const recruitSlots = pgTable('recruit_slots', {
  id: uuid('id').primaryKey().defaultRandom(),
  cohortId: uuid('cohort_id')
    .notNull()
    .references(() => recruitCohorts.id, { onDelete: 'cascade' }),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  durationMin: integer('duration_min').notNull().default(20),
  link: text('link'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// 지원자(구글폼 전 필드). birth_date·ot_attend·remote_interview_wish 는 폼 표기가 제각각이라 원문 text 로 둔다.
export const recruitApplicants = pgTable(
  'recruit_applicants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cohortId: uuid('cohort_id')
      .notNull()
      .references(() => recruitCohorts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    gender: text('gender'),
    birthDate: text('birth_date'),
    phone: text('phone').notNull(), // 조회 매칭 키(이름+전화 정확 일치). PII — RAG 금지.
    school: text('school'),
    department: text('department'),
    email: text('email'),
    applyRoute: text('apply_route'), // 지원 경로
    otherActivities: text('other_activities'), // 다른 대외활동/아르바이트
    expectedFrequency: text('expected_frequency'), // 예상 활동 참여 주기
    wishTeam1: text('wish_team1'),
    wishTeam2: text('wish_team2'),
    nearStation: text('near_station'), // 주소 대신 가장 가까운 역 명만 저장(PII 최소화)
    otAttend: text('ot_attend'), // OT 참가 여부(원문)
    remoteInterviewWish: text('remote_interview_wish'), // 비대면 면접 희망(원문)
    essayIntro: text('essay_intro'), // 자기소개
    essayValues: text('essay_values'), // 가치관 확인
    status: recruitStatusEnum('status').notNull().default('received'),
    slotId: uuid('slot_id').references(() => recruitSlots.id, { onDelete: 'set null' }),
    interviewLink: text('interview_link'), // 개인 단위 링크(슬롯 링크보다 우선)
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('recruit_applicants_cohort_idx').on(t.cohortId)]
);

// 채점(서류·면접). 본인 점수만 수정(UNIQUE). 0.0~10.0, 0.5 단위(서비스 검증 + 마이그레이션 CHECK).
export const recruitScores = pgTable(
  'recruit_scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicantId: uuid('applicant_id')
      .notNull()
      .references(() => recruitApplicants.id, { onDelete: 'cascade' }),
    scorerUserId: uuid('scorer_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stage: recruitScoreStageEnum('stage').notNull(),
    score: numeric('score', { precision: 3, scale: 1 }).notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('recruit_scores_uq').on(t.applicantId, t.scorerUserId, t.stage)]
);

// 지원자별 개인 메모(작성자 1인당 1개). 면접 콘솔에서 질문 미리 적는 용도, 자동 저장.
export const recruitMemos = pgTable(
  'recruit_memos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicantId: uuid('applicant_id')
      .notNull()
      .references(() => recruitApplicants.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull().default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('recruit_memos_uq').on(t.applicantId, t.authorUserId)]
);

// 화면별 공용 메모지(운영진 누구나 함께 쓰고 지우는 자유 메모). context_key 로 화면 구분.
// 지원자별 개인 메모(recruit_memos)와는 별개. 자동 저장, 마지막 수정자·시각 표시.
export const screenNotes = pgTable('screen_notes', {
  contextKey: text('context_key').primaryKey(), // 예: 'recruit:doc', 'recruit:interview-assign'
  content: text('content').notNull().default(''),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// CSV 열↔필드 매핑 프리셋(매 기수 열 이름이 달라질 수 있어 저장·재사용). mapping = { 필드명: CSV헤더 }.
export const recruitMappingPresets = pgTable('recruit_mapping_presets', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  mapping: jsonb('mapping').$type<Record<string, string>>().notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
