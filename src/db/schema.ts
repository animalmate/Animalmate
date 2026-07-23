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

// pgvector 임베딩 차원. GEMINI_EMBEDDING_MODEL 확정(Phase 1D) 후 정확한 값으로 핀 고정할 것.
// 값이 바뀌면 doc_chunks.embedding 재생성 마이그레이션 필요(데이터 없을 때 진행 권장).
// TODO(Phase 1D): 콘솔에서 임베딩 모델 확인 후 차원 확정.
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

// ── 조직/계정 ──────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
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
export interface TeamLeader {
  label: string; // 팀장 / 부팀장 등
  name: string;
  phone: string;
  email?: string; // 있으면 그 계정에 이 팀 관리 권한 부여(team_members 동기화). 없으면 공지 표시용.
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
    position: teamPositionEnum('position').notNull(), // leader = 팀장단
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
  titleTemplate: text('title_template').notNull(), // {{날짜}} {{장소}} {{집합시간}} {{정원}} 플레이스홀더
  bodyTemplate: text('body_template').notNull(),
  updatedBy: uuid('updated_by')
    .notNull()
    .references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// recurring_rules: 이제 "일괄 생성 도우미의 저장된 프리셋"(크론 자동 생성 아님). 실체 = generation preset.
// 이름은 마이그레이션 안정성을 위해 유지(리네임 회피).
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
