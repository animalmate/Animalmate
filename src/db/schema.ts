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
  check,
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
  // 발행 워커가 집어 간 상태(카페 쓰기 진행 중). 크론이 매분 도는데 한 사이클은 건당 30초라
  // 5건이면 2분 걸린다 — 그 사이 다음 워커가 아직 scheduled 인 글을 다시 집어 가서
  // 같은 공지가 카페에 두 번 올라갈 수 있었다. 카페는 삭제 API 가 없어 되돌릴 수 없다(규칙 #2).
  // updated_at 이 이 점유의 임차 시각이며, 오래된 publishing 은 워커가 죽은 것으로 보고 회수한다.
  'publishing',
  'published',
  'failed',
]);
// 신청 기능 폐기로 단순화(결정 2026-07-23): draft → published → done | canceled.
export const eventStatusEnum = pgEnum('event_status', ['draft', 'published', 'done', 'canceled']);
// enum 정의에 없지만 03 본문에서 쓰는 보조 enum
export const membershipStatusEnum = pgEnum('membership_status', ['active', 'expired']);
export const teamKindEnum = pgEnum('team_kind', ['activity', 'functional']);
export const teamPositionEnum = pgEnum('team_position', ['leader', 'member']);
// 문서의 출처. manual = 회장단이 손으로 쓴 안내 문서, guidebook = 팀 가이드북 PDF 에서 뽑아낸 본문.
// 갈라 두는 이유: `/documents` 관리 목록에 가이드북 본문까지 섞이면 회장단이 손으로 쓴 문서를
// 찾기 어렵다. 챗봇 검색은 둘을 구분하지 않는다(같은 doc_chunks 를 본다).
export const documentKindEnum = pgEnum('document_kind', ['manual', 'guidebook']);
// 가이드북 처리 단계. extracting = 파일은 올라왔고 지금 읽는 중, extracted = 텍스트를 뽑아 두고
// 사람 확인을 기다리는 중, ready = 확인까지 끝나 챗봇이 읽는 중, failed = 추출이 실패해 파일만
// 있는 상태(보기는 되고 챗봇은 모른다).
//
// `extracting` 이 있는 이유: 행을 **추출보다 먼저** 남기기 때문이다(마이그레이션 0034).
// 예전에는 추출을 마친 뒤에 행을 넣어서, 함수가 60초에 잘리면 행이 아예 안 생기고 파일만
// 스토리지에 떠돌았다 — 화면에는 아무것도 안 보이니 올린 사람은 또 올린다.
export const guidebookStatusEnum = pgEnum('guidebook_status', ['extracting', 'extracted', 'ready', 'failed']);
export const naverTokenStatusEnum = pgEnum('naver_token_status', ['ok', 'error']);
// 제거됨: monthWeekEnum — recurring_rules 전용이었다(마이그레이션 0020).
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

// 5. 최종 검토 화면에서 팀장단이 붙이는 **의견 표시**(2026-08-24). 결정이 아니다 —
// 상태(recruit_status)를 건드리지 않고, 6번 화면에서 회장단이 보고 판단할 근거로만 남는다.
//   drop = 탈락시킬 사람 / move = 다른 팀으로 보낼 사람.
// 두 값을 boolean 두 개가 아니라 **한 칸의 enum** 으로 두는 이유: 둘은 동시에 참일 수 없는데
// (내보낼 사람을 동시에 탈락시킬 수는 없다) 칸을 나누면 둘 다 켜진 행이 만들어지고,
// 그 행을 어떻게 읽을지는 아무 데도 안 적혀 있어 결국 회장단이 매번 되물어야 한다.
export const recruitReviewMarkEnum = pgEnum('recruit_review_mark', ['drop', 'move']);

/**
 * 결과 안내 메일의 단계. 채점 단계(recruit_score_stage)와 값이 겹치지만 **다른 것**이라 따로 둔다 —
 * 채점은 서류/면접 둘뿐이고, 안내 메일은 최종 발표까지 셋이다.
 */
export const recruitResultMailStageEnum = pgEnum('recruit_result_mail_stage', [
  'document', // 서류 결과 + 면접 일정 안내(합격·불합격 모두 — 둘은 같은 스위치로 함께 공개된다)
  'interview', // 면접 일정 **변경** 안내(발표 뒤 배정이 바뀐 사람에게만 다시)
  'final', // 최종 결과 안내(합격·불합격 모두)
]);

/** 결과 안내 메일 한 통의 상태. queued → sent 또는 failed(재시도 소진). */
export const recruitResultMailStatusEnum = pgEnum('recruit_result_mail_status', [
  'queued',
  'sent',
  'failed',
]);

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
  /**
   * 챗봇 대화 "초기화" 경계. 이 시각 **이후** chat_logs 만 화면에 복원한다.
   *
   * 왜 행을 지우지 않는가: `quota.ts` 가 **chat_logs 행 수로** 인당 일일 사용량을 센다.
   * 초기화가 삭제라면 버튼 한 번으로 일일 상한(기본 30건)을 무한히 우회할 수 있다.
   * 감사 기록·챗봇 평가 데이터도 함께 사라진다. 그래서 경계 시각만 남기고 행은 보존한다.
   */
  chatClearedAt: timestamp('chat_cleared_at', { withTimezone: true }),
  /**
   * 탈퇴 시각. 값이 있으면 **탈퇴한 계정**이며 로그인·복구가 불가능하다.
   *
   * 왜 행을 지우지 않는가: scheduled_posts·post_templates·documents·join_codes·recruit_cohorts 의
   * created_by 가 이 행을 참조하므로 DELETE 자체가 거부되고, audit_logs.actor_user_id 는
   * ON DELETE SET NULL 이라 지우면 "누가 했는지"가 감사 기록에서 사라진다(규칙 #4 위반).
   * 그래서 탈퇴는 행 삭제가 아니라 **개인정보(이름·이메일·전화) 삭제 + 영구 잠금**으로 구현한다.
   * 원래 이메일은 남기지 않으므로 같은 주소로 새로 가입할 수 있다(별개의 새 계정).
   */
  withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
  /**
   * 마지막으로 로그인 상태로 사이트를 쓴 시각. **멤버십 자동 만료의 기준**이다(필수원칙 #2).
   *
   * 왜 임기(term_end)가 아니라 이것인가(2026-07-31 개정, 07-DECISIONS 82): 학기마다 임기를 다시
   * 박으려면 사람이 매 학기 연장해 줘야 하는데, 그 화면이 없으면 **아무도 손대지 않은 채 전원이
   * 동시에 강등된다**(실제로 회장단·시스템관리자 2계정이 그 상태였다). 활동을 기준으로 삼으면
   * 쓰는 사람은 자동으로 갱신되고, 안 쓰는 사람만 조용히 정리된다 — 사람 손이 필요 없다.
   *
   * 갱신은 `loadActor` 가 한다(로그인 상태의 모든 요청이 지나는 길목). 요청마다 쓰지 않고
   * 하루 지났을 때만 쓴다 — 이 값의 해상도는 '일' 이면 충분하고, 그 길목에 매번 UPDATE 를
   * 얹으면 모든 화면이 느려진다.
   */
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
// ⚠ DB 에는 `users_last_seen_idx`(last_seen_at) 인덱스가 있다 — 손으로 쓴 마이그레이션 0024 에서
// 만들었고 여기(schema.ts)에도 drizzle 스냅샷에도 없다. 즉 **drizzle 은 그 인덱스를 모른다.**
// 여기에 index() 로 다시 선언하면 generate 가 이미 있는 이름으로 CREATE INDEX 를 뽑아 마이그레이션이
// 실패한다. 지우거나 바꾸려면 마이그레이션 SQL 을 손으로 써야 한다. (같은 사정: recruit_slots.cohort_id)

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
// 가입 계정 팀장단은 team_members(position=leader)로 관리하고 여기 두지 않는다.
// 표시 순서는 출처와 무관하게 직함 순(팀장→부팀장→기타)이다 — mergeLeaders 가 합친 뒤 정렬한다.
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
  // 모집 공고 편집 권한(0032). 켜진 팀에 소속된 운영진은 신입 모집 0번 화면에서 공고 본문·포스터·
  // 지원서 문항을 쓰고 기수를 만들 수 있다(홍보팀 용도). **팀 이름으로 판단하지 않는 이유**는
  // 07-DECISIONS 66 에 있다 — 이름은 매 학기 바뀌고, 이 리포는 이미 UUID 를 이름처럼 비교해
  // 항상 false 인 검사(`isPRTeamOrPrivileged`)를 오래 달고 있었다. 회장단이 회원 관리에서 켠다.
  canEditNotice: boolean('can_edit_notice').notNull().default(false),
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

// 제거됨: invites (마이그레이션 0020). 학기별 가입코드(join_codes)가 대체했고(결정 2)
// 읽고 쓰는 코드가 하나도 없었다. 0행 확인 후 DROP.

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

// 제거됨: recurring_rules (마이그레이션 0020). 일괄 생성 기능을 없앤 2026-07-24 이후로
// 읽고 쓰는 코드가 없었고, 데이터 보존을 위해 남겨 두었지만 0행이라 보존할 것도 없었다.
// events.rule_id 도 함께 제거(이 테이블만 참조하던 컬럼).

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
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
  // 손으로 쓴 문서인지, 가이드북 PDF 에서 뽑아낸 본문인지. 관리 목록을 가르는 데만 쓴다.
  kind: documentKindEnum('kind').notNull().default('manual'),
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

// 기수(cohort). 공개 스위치 2개(면접 일정 / 최종 결과) 및 모집 공고/마감 스위치를 조작한다.
export const recruitCohorts = pgTable('recruit_cohorts', {
  id: uuid('id').primaryKey().defaultRandom(),
  label: text('label').notNull().unique(), // 예: "33기" 또는 "2026-2 신입"
  schedulePublic: boolean('schedule_public').notNull().default(false), // 면접 일정·링크 조회 공개
  resultPublic: boolean('result_public').notNull().default(false), // 최종 결과 조회 공개
  noticeContent: text('notice_content'), // 공개 모집 공고 텍스트/마크다운
  noticeImages: jsonb('notice_images').$type<string[]>(), // 공개 모집 공고 이미지 URL 리스트
  congratsMessage: text('congrats_message'), // 최종 합격자 축하 멘트
  postPassNotice: text('post_pass_notice'), // 최종 합격자 합격 후 안내 사항
  isClosed: boolean('is_closed').notNull().default(false), // 모집 중단/마감 스위치
  venues: jsonb('venues').$type<string[]>(), // 기수별 사전 등록 대면 면접 장소 프리셋 리스트
  // 면접 당일 대기실 업무 이름들(예: 면접자 명단 체크·대기실 안내·면접장 인솔a). 기수마다 다르다.
  // 미설정이면 src/recruit/duties.ts 의 기본값을 쓴다.
  dutyRoles: jsonb('duty_roles').$type<string[]>(),
  // 공개 지원서의 선택지·자기소개서 문항(기수마다 다르다). 미설정이면 코드의 기본값을 쓴다.
  // 형태는 src/recruit/apply-form.ts 의 ApplyFormConfig.
  applyForm: jsonb('apply_form'),
  // 폐기(hard delete) 시각 + 그때 남기는 익명 집계(지원자 수·합격자 수·평균 점수). 폐기 전엔 null.
  closedAt: timestamp('closed_at', { withTimezone: true }),
  archivedStats: jsonb('archived_stats'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// 면접 슬롯(조×시간 격자). 10분 단위 세분화 지원. 장소 프리셋 또는 비대면 링크 지정.
export const recruitSlots = pgTable('recruit_slots', {
  id: uuid('id').primaryKey().defaultRandom(),
  cohortId: uuid('cohort_id')
    .notNull()
    .references(() => recruitCohorts.id, { onDelete: 'cascade' }),
  /**
   * 소속 조 이름('A조'·'B조'·'비대면 파견'). 조는 **하루 종일 유지되는 트랙**이다 — 한 방을 잡고
   * 그 안에서 시간대마다 면접관·면접자를 바꿔 가며 본다(지난 기수 시간표가 정확히 이 모양이다).
   *
   * 왜 컬럼이어야 하나: 예전에는 조를 "같은 시각 슬롯들의 순번"으로 **계산**했다. 그러면 A조가 한
   * 시간대를 비우는 순간(첫 30분 면접실 정비 등) 그 아래부터 B조가 1조로 밀려 이름이 바뀐다.
   * 조는 계산해서 붙이는 번호가 아니라 슬롯이 처음부터 가지고 있는 소속이다.
   *
   * null = 조를 나누기 전에 만든 옛 슬롯(마이그레이션 0026 이전). 화면은 '조 미지정'으로 보여준다.
   */
  panel: text('panel'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  durationMin: integer('duration_min').notNull().default(20),
  link: text('link'),
  venue: text('venue'), // 대면 면접 장소 명칭 또는 온라인 접속 안내(조 단위로 같은 값이 들어간다)
  isRemote: boolean('is_remote').notNull().default(false), // 비대면 여부
  // 그 줄에 적어 두는 자유 메모('예비석 2자리', '면접실 정비', '지원자 요청으로 15분 지연').
  // 지난 기수 엑셀에 이런 칸이 늘 있었다(예비석 열, '전원 면접실 B 정비' 줄) — 적을 자리가
  // 없으면 배정은 화면에서 하고 메모만 엑셀에 남겨, 결국 원본이 둘로 갈라진다.
  note: text('note'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
// ⚠ DB 에는 `recruit_slots_cohort_idx`(cohort_id) 인덱스가 있다(마이그레이션 0014, 손으로 작성).
// users_last_seen_idx 와 같은 사정 — schema.ts·drizzle 스냅샷 어디에도 없으니 여기서 다시 선언하지 말 것.

// 슬롯별 면접관(운영진) 배정 테이블
export const recruitSlotInterviewers = pgTable(
  'recruit_slot_interviewers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slotId: uuid('slot_id')
      .notNull()
      .references(() => recruitSlots.id, { onDelete: 'cascade' }),
    /**
     * 홈페이지 계정. **없어도 된다**(0028) — 계정이 실제로 필요한 것은 면접 콘솔에서 점수를
     * 넣을 때뿐이고(`recruit_scores.scorer_user_id`), 시간표에 이름이 뜨는 것과는 무관하다.
     * 계정을 강제하면 알럼나이·계정을 안 만든 사람이 표에서 통째로 빠져 **공지에 나갈 표에
     * 구멍이 뚫린다**(33기에 실제로 두 명이 그랬다).
     */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    /** 계정이 없을 때 표에 적을 이름. `user_id` 가 있으면 null 이고 이름은 users 에서 읽는다. */
    name: text('name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // 계정 배정은 예전대로 슬롯당 한 번씩만. 이름만 적은 칸은 NULL 이라 이 제약에 걸리지 않으므로
  // (Postgres 는 NULL 을 서로 다르게 본다) 중복은 아래 이름 UNIQUE 가 막는다.
  (t) => [
    unique('recruit_slot_interviewers_uq').on(t.slotId, t.userId),
    unique('recruit_slot_interviewers_name_uq').on(t.slotId, t.name),
  ]
);

// 면접 당일 지원 업무(대기실) 배정. 면접관이 아니라 명단 체크·대기실 안내·인솔을 맡는 사람들.
// 지난 기수는 이걸 별도 엑셀로 돌렸다(22.png) — 면접 시간표와 같은 시간축을 쓰므로 함께 둔다.
//
// starts_at 은 recruit_slots 를 FK 로 걸지 않는다. 대기실 업무는 면접이 없는 시간대에도 있고
// (예: 첫 30분 '전원 면접실 정비'), 슬롯 하나를 지웠다고 그 시간의 대기실 배정까지
// 사라지면 안 된다. 시간축만 공유한다.
export const recruitDutyAssignments = pgTable(
  'recruit_duty_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cohortId: uuid('cohort_id')
      .notNull()
      .references(() => recruitCohorts.id, { onDelete: 'cascade' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    /** 역할 이름(기수 설정의 duty_roles 중 하나). 전원 공지 줄은 DUTY_ALL 센티넬을 쓴다. */
    duty: text('duty').notNull(),
    /** 배정된 운영진. 전원 공지 줄에서는 null. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /**
     * 계정이 없는 사람의 이름(0028). 대기실 업무는 명단 체크·인솔이라 홈페이지에 로그인할 일이
     * 전혀 없다 — 계정을 강제하면 그 사람이 표에서 빠져 당일 안내가 비어 버린다.
     * `user_id` 가 있으면 null 이고 이름은 users 에서 읽는다.
     */
    name: text('name'),
    /** 전원 공지 문구('전원 면접실 B 정비'). 역할 배정 줄에서는 null. */
    note: text('note'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // 한 시간대의 한 역할에는 한 명. 같은 칸을 두 번 저장하면 덮어쓴다(upsert).
  (t) => [unique('recruit_duty_assignments_uq').on(t.cohortId, t.startsAt, t.duty)]
);

// 지원자(구글폼 전 필드 또는 온라인 직접 입력). birth_date·ot_attend·remote_interview_wish 는 폼 표기가 제각각이라 원문 text 로 둔다.
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
    assignedTeam: text('assigned_team'), // 운영진/회장단이 수동 이관 또는 배정한 최종 팀
    nearStation: text('near_station'), // 주소 대신 가장 가까운 역 명만 저장(PII 최소화)
    otAttend: text('ot_attend'), // OT 참가 여부(원문)
    remoteInterviewWish: text('remote_interview_wish'), // 비대면 면접 희망(원문)
    essayIntro: text('essay_intro'), // 자기소개
    essayValues: text('essay_values'), // 가치관 확인(답변 본문)
    essayValuesTopic: text('essay_values_topic'), // 가치관 문항에서 고른 주제
    // 합격 시 외부 단체(로타랙트) 가입용. 불합격 시 폐기 — PII 이므로 다른 지원자 정보와 함께 폐기된다.
    englishName: text('english_name'),
    status: recruitStatusEnum('status').notNull().default('received'),
    // 최종 검토(5번)에서 팀장단이 붙인 의견 표시. null = 아직 아무 표시도 안 함.
    // 상태와 달리 **되돌리기 자유로운 메모성 값**이라 전이 규칙(status.ts)을 태우지 않는다.
    reviewMark: recruitReviewMarkEnum('review_mark'),
    // '다른 팀으로 보낼 사람'에 **어느 팀인지**까지 적을 수 있다. 비워 둘 수 있다(= 팀 미정):
    // 회의에서 "얘는 여기 아니다"까지만 정하고 갈 곳은 나중에 맞추는 일이 실제로 흔하다.
    // 표시가 'move' 가 아니게 되면 이 값도 같이 지운다(review-marks.ts `normalizeMoveTeam`) —
    // 탈락으로 바꿨는데 옛 목적지가 남아 있으면 6번 화면에서 무엇을 믿을지 알 수 없다.
    // 팀 이름을 **문자열로** 둔다: 기수 설정의 팀 목록(assigned_team·wish_team1 과 같은 꼴)이라
    // 참조할 팀 테이블이 따로 없다.
    reviewMoveTeam: text('review_move_team'),
    slotId: uuid('slot_id').references(() => recruitSlots.id, { onDelete: 'set null' }),
    interviewLink: text('interview_link'), // 개인 단위 링크(슬롯 링크보다 우선)
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
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

/**
 * 결과 안내 메일 발송 대기열 겸 이력.
 *
 * 왜 테이블이 필요한가: 메일은 **되돌릴 수 없다.** 누구에게 무엇을 보냈는지 남는 곳이 없으면
 * 중복 발송도 실패 재시도도 판단할 수 없다. `(applicant_id, stage)` UNIQUE 가 곧 중복 방어다 —
 * 공개 스위치를 껐다 켜도, 발송 버튼을 두 번 눌러도 같은 사람에게 같은 안내가 두 번 가지 않는다.
 *
 * **이메일 주소를 여기 복사하지 않는다.** 보낼 때 지원자 행에서 읽는다 — 주소를 여기 두면
 * 기수 파기(`recruit/purge`)가 지운 PII 의 사본이 남는다. 지원자가 지워지면 이 행도 함께 사라진다.
 */
export const recruitResultMails = pgTable(
  'recruit_result_mails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicantId: uuid('applicant_id')
      .notNull()
      .references(() => recruitApplicants.id, { onDelete: 'cascade' }),
    stage: recruitResultMailStageEnum('stage').notNull(),
    status: recruitResultMailStatusEnum('status').notNull().default('queued'),
    /** 시도 횟수. 최대 2회 재시도 후 failed 로 확정한다(규칙 #5). */
    attempts: integer('attempts').notNull().default(0),
    /** 마지막 실패 사유. 운영진이 왜 안 갔는지 볼 수 있어야 한다. */
    lastError: text('last_error'),
    /** 누가 발송을 걸었는가. 200명에게 나가는 행위라 사람이 남아야 한다. */
    queuedBy: uuid('queued_by').references(() => users.id, { onDelete: 'set null' }),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [
    unique('recruit_result_mails_uq').on(t.applicantId, t.stage),
    // 크론이 매번 "보낼 것"과 "최근 24시간에 보낸 수"를 찾는다. 둘 다 status 로 시작한다.
    index('recruit_result_mails_status_idx').on(t.status, t.sentAt),
  ]
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


// ── 동아리 일정(캘린더) ────────────────────────────────────────────────
// 총회·MT·정기회의처럼 **날짜가 있는 모든 것**. 봉사 회차(events)와는 별개다:
// events 는 카페 공지 발행 파이프라인에 묶인 봉사 전용이고, 여기는 그 밖의 동아리 일정 전부다.
//
// 왜 문서(documents)가 아니라 테이블인가: "동아리 일정" 을 문서로 적어 두면 학기마다 썩는다.
// 아무도 문서를 고치지 않기 때문이다(2026-08-03 결정 86). 일정을 표로 두면 챗봇이 **지금 값**을
// tool 로 읽어 답하므로, 사람이 문서를 고치지 않아도 답이 낡지 않는다.
//
// visibility 는 documents 와 같은 등급을 쓴다 — 챗봇이 질문자 역할 이하만 검색하는 규칙(#3)을
// 일정에도 그대로 적용하기 위해서다(src/auth/visibility.ts 가 단 하나의 정의).
export const schedules = pgTable(
  'schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'), // 여러 날 일정(MT 등). null = 하루짜리
    startTime: time('start_time'), // null = 시간 미정(종일)
    place: text('place'),
    details: text('details'), // 세부사항(준비물·회비·집합 방법 등 자유 서술)
    visibility: visibilityEnum('visibility').notNull().default('member'),
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('schedules_start_idx').on(t.startDate)]
);

// ── 팀 가이드북 ────────────────────────────────────────────────────────
// 팀별 가이드북 PDF. 두 가지를 동시에 한다: **부원이 화면에서 바로 보는 파일**과
// **챗봇이 읽는 본문**(documentId 로 documents 를 가리킨다).
//
// 왜 파일과 본문을 갈라 두나: PDF 는 사람이 보기에 좋고 챗봇은 못 읽는다. 그래서 올릴 때
// 한 번 텍스트로 옮겨 documents 에 넣고, 그 뒤로는 기존 RAG 파이프라인(청킹·임베딩·visibility)이
// 그대로 처리한다. 가이드북 때문에 검색 코드를 새로 짜지 않는다.
//
// **팀당 한 건**(team_id unique). 새로 올리면 이전 파일과 본문을 교체한다 — 가이드북이 여러 벌
// 쌓이면 어느 것이 지금 것인지 아무도 모르고, 챗봇은 낡은 쪽을 집어 답할 수 있다.
export const teamGuidebooks = pgTable('team_guidebooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id')
    .notNull()
    .unique()
    .references(() => teams.id, { onDelete: 'cascade' }),
  // 챗봇이 읽는 본문. null = 아직 확인 전이거나 추출이 실패한 것(파일 보기는 그래도 된다).
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  storagePath: text('storage_path').notNull(), // 버킷 내부 경로(서명 URL 발급·삭제에 쓴다)
  fileName: text('file_name').notNull(), // 올린 사람이 준 원본 파일명(표시용)
  fileBytes: integer('file_bytes').notNull(),
  status: guidebookStatusEnum('status').notNull().default('extracted'),
  // 추출해 놓고 아직 확인받지 못한 본문. 확인하면 documents 로 옮기고 여기서 비운다.
  // (확인 전에는 챗봇이 못 읽어야 하므로 doc_chunks 에 넣지 않는다.)
  pendingText: text('pending_text'),
  failReason: text('fail_reason'),
  uploadedBy: uuid('uploaded_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── 동아리 전체 가이드북 ───────────────────────────────────────────────
// 기수 단위로 회장단이 올리는 한 권(예: "33기 전체 가이드북"). 팀 가이드북과 **테이블을 나눴다.**
//
// 왜 나눴나: 이쪽은 **챗봇이 읽지 않는다**(2026-09-03 사용자 결정). 부원이 파일을 보는 것이 전부라
// documents·pending_text·status 가 통째로 필요 없다. 억지로 team_guidebooks 에 얹으면 team_id 를
// nullable 로 풀어야 하고(팀당 한 건이라는 보장이 사라진다), 쓰지 않는 칸이 절반이 된다.
// 챗봇에 넣지 않은 이유도 분명하다 — 회칙·회비·활동기간은 이미 `동아리 기본 정보` 문서에 있고,
// 같은 사실이 문서 두 곳에 생기면 결정 153(회비가 검색 12위로 밀린 그 건)이 그대로 재현된다.
//
// **행은 하나뿐이다.** 기수별로 쌓지 않는다(사용자 결정) — 새 기수가 오면 파일만 갈아 끼운다.
// 고정 PK + CHECK 로 DB 가 그것을 보장한다(마이그레이션 0034). 두 벌이 쌓이면 화면이 어느 것을
// 그릴지 알 수 없고, 부원은 지난 기수 것을 보고 있을 수 있다.
//
// **제목 칸이 없다**(0035 에서 뺐다). 칸이 하나뿐이라 이름이 늘 같다 — `전체 부원 가이드북`.
// 기수를 이름에 넣으면 새 기수마다 사람이 고쳐 줘야 하고, 안 고치면 표시가 거짓이 된다.
export const CLUB_GUIDEBOOK_ID = 'club';
export const clubGuidebooks = pgTable(
  'club_guidebooks',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => CLUB_GUIDEBOOK_ID),
    storagePath: text('storage_path').notNull(),
    fileName: text('file_name').notNull(),
    fileBytes: integer('file_bytes').notNull(),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // 고정 키 + CHECK = "행은 하나뿐"의 DB 보장. 스키마에 적어 두는 이유는 다음 db:generate 가
  // 모르는 제약으로 보고 지워 버리지 않게 하기 위해서다.
  (t) => [check('club_guidebooks_singleton', sql`${t.id} = 'club'`)]
);

// ── 번개(즉흥 소모임) ──────────────────────────────────────────────────
// 카톡 공지 → 개최자에게 개인톡, 으로 굴러가던 것을 게시판으로 옮긴다. 옮기는 이유는 "글이
// 예뻐서"가 아니라 **순서가 남지 않기 때문이다**: 카톡 개인톡은 누가 먼저 말했는지 개최자
// 머릿속에만 있고, 나중에 다투면 근거가 없다. 신청을 행으로 받으면 선착순이 DB 가 아는 사실이 된다.
//
// 일정(schedules)과 갈라 둔 이유: 일정은 회장단이 공표하는 **동아리 공식 일정**이고 신청이 없다.
// 번개는 부원 아무나 열자고 손들 수 있고(운영진 승인), 정원·대기·쪽지가 붙는다. 한 테이블에
// 얹으면 schedules 의 절반이 늘 비어 있게 되고, 캘린더 화면이 신청 상태를 몰라 잘못 그린다.
//
// 봉사 회차(events)와도 다르다 — events 는 카페 공지 발행 파이프라인에 묶여 있다.
// 번개는 카페에 나가지 않는다(규칙 #2: 카페는 수정·삭제가 안 되는데 번개는 자주 바뀐다).
export const flashStatusEnum = pgEnum('flash_status', [
  'pending', // 부원이 낸 개최 신청 — 운영진 승인 대기(게시판에 아직 안 보인다)
  'open', // 모집 중
  'closed', // 개최자가 신청을 닫음(번개 자체는 열린다)
  'canceled', // 번개가 취소됨
  'rejected', // 개최 신청이 거절됨
]);
// 선착순이라 "승인" 단계가 없다 — 신청하는 순간 자리가 있으면 확정, 없으면 대기다.
export const flashSignupStatusEnum = pgEnum('flash_signup_status', ['confirmed', 'waitlisted', 'canceled']);

export const flashMeetups = pgTable(
  'flash_meetups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    meetDate: date('meet_date').notNull(),
    meetTime: time('meet_time'), // null = 시간 미정
    place: text('place'),
    details: text('details'), // 세부 내용(회비·준비물·방탈출 테마 목록 등 자유 서술)
    /** 정원. **null = 인원 제한 없음**(0 이 아니다 — 0 은 "아무도 못 온다"는 뜻이 돼 버린다). */
    capacity: integer('capacity'),
    /**
     * **신청을 받기 시작하는 순간**(0037). null = 글이 올라간 때부터 바로 받는다.
     *
     * 왜 필요한가(2026-09-04 사용자 요청): 인기 있는 번개는 올리자마자 자리가 차서, 글을 언제
     * 올렸는지를 아는 사람만 들어간다. 시작 시각을 미리 못 박아 두면 **모두가 같은 출발선**에 선다
     * ("9월 30일 오후 3시부터").
     *
     * `timestamptz` 인 이유: 이 값은 날짜가 아니라 **순간**이다. date+time 두 칸으로 쪼개면
     * 비교할 때마다 시간대를 조립해야 하고, 그 조립이 한 번만 틀려도 9시간 어긋난다.
     * 화면이 준 KST 벽시계는 `kstLocalToInstant` 한 곳에서만 순간으로 바꾼다.
     */
    signupOpenAt: timestamp('signup_open_at', { withTimezone: true }),
    status: flashStatusEnum('status').notNull().default('pending'),
    /** 개최 신청을 낸 사람. 공동 개최자 전원은 flash_hosts 에 따로 있고 이 사람도 거기 들어간다. */
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    // 승인·거절한 운영진과 그 사유. 거절을 사유 없이 돌려보내면 다시 낼 방법을 모른다.
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'), // 거절 사유 / 취소 사유
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('flash_meetups_date_idx').on(t.meetDate)]
);

/**
 * 공동 개최자. 번개는 여럿이 함께 여는 일이 흔해서(사용자 요청) 개최자를 컬럼 하나로 두지 않는다.
 *
 * `read_at` 이 여기 붙어 있는 이유: 홈의 "새 신청 N건" 배지는 **개최자마다 따로** 세어야 한다.
 * 번개 행에 읽음 시각을 하나만 두면 공동 개최자 중 한 명이 열어 본 순간 나머지 배지가 같이
 * 꺼져, 다른 개최자는 새 신청이 온 줄 모른다.
 */
export const flashHosts = pgTable(
  'flash_hosts',
  {
    flashId: uuid('flash_id')
      .notNull()
      .references(() => flashMeetups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 이 개최자가 이 번개의 신청·쪽지를 마지막으로 훑어본 시각. null = 아직 한 번도 안 봄. */
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [unique('flash_hosts_uq').on(t.flashId, t.userId)]
);

/**
 * 번개 신청. **메시지가 곧 신청이다**(사용자 결정) — "테마 1 참가하고 싶습니다!" 처럼 쓴 첫 쪽지가
 * 신청 행을 만든다. 빈 신청 버튼을 따로 두지 않는 이유는, 개최자가 실제로 알고 싶어 하는 것이
 * "몇 명"이 아니라 "누가 무엇을 하겠다고 했는가"이기 때문이다.
 *
 * `seq` = 그 번개 안에서의 신청 순번(1부터). 선착순·대기 승격의 유일한 근거다.
 * created_at 으로 대신하지 않는 이유: 같은 밀리초에 두 건이 들어오면 순서가 흔들리고, 그 순간이
 * 하필 정원 경계면 누가 확정인지 뒤집힌다. 채번은 번개 행을 잠근 트랜잭션 안에서만 한다.
 *
 * 취소했다가 다시 신청하면 **새 번호를 받는다**(행은 재사용, seq 만 새로 채번). 옛 번호를
 * 그대로 살리면 한 번 빠졌던 사람이 대기 줄 앞자리를 계속 쥐게 된다.
 *
 * 예외가 하나 있다: `placed_by` 가 찍힌 행은 **개최자가 직접 넣은 자리**라 첫 쪽지가 없다.
 */
export const flashSignups = pgTable(
  'flash_signups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    flashId: uuid('flash_id')
      .notNull()
      .references(() => flashMeetups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: flashSignupStatusEnum('status').notNull().default('confirmed'),
    seq: integer('seq').notNull(),
    /** 신청자가 이 대화를 마지막으로 본 시각(개최자 답장 배지용). */
    applicantReadAt: timestamp('applicant_read_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    /** 취소를 누른 사람. 본인이면 자진 취소, 개최자면 내보내기 — 화면 문구가 갈린다. */
    canceledBy: uuid('canceled_by').references(() => users.id, { onDelete: 'set null' }),
    /**
     * 이 자리를 **개최자가 대신 잡아 준** 경우 그 개최자. null = 본인이 보낸 신청이다.
     *
     * 왜 숫자가 아니라 행인가(2026-09-05 사용자 결정): "이 번개는 운영진 한 명을 미리 넣어 둔다"
     * 같은 일이 있다. 정원에서 머릿수만 깎아 두면 그 자리의 주인이 명단에 안 남아, 개최자는
     * 누구를 넣어 뒀는지 기억에 의존하게 되고 쪽지도 못 보내며 못 오게 됐을 때 뺄 방법도 없다.
     * 신청 행으로 넣으면 선착순 계산(`assignSeats`)·취소·대기 승격이 전부 기존 코드 그대로 굴러간다.
     *
     * 넣어진 사람도 **본인이 취소할 수 있다** — 대신 넣어 준 것이지 대신 약속한 것이 아니다.
     * 자리를 빼앗지도 않는다: 이미 정원이 찬 뒤에 넣으면 그 사람이 대기 줄로 간다.
     */
    placedBy: uuid('placed_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('flash_signups_uq').on(t.flashId, t.userId), // 한 번개에 한 사람 한 자리
    index('flash_signups_order_idx').on(t.flashId, t.seq),
  ]
);

/**
 * 신청 건마다 붙는 1:1 대화(신청자 ↔ 개최자 전원). 첫 줄이 신청 메시지다.
 * 개최자가 직접 넣은 자리(`flash_signups.placed_by`)만 **줄이 하나도 없는 채로** 시작한다.
 */
export const flashMessages = pgTable(
  'flash_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    signupId: uuid('signup_id')
      .notNull()
      .references(() => flashSignups.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('flash_messages_thread_idx').on(t.signupId, t.createdAt)]
);
