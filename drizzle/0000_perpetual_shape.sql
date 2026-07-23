-- pgvector: doc_chunks.embedding + hnsw 인덱스가 의존. 반드시 먼저 생성(수동 추가, 03/규칙 RAG).
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('applied', 'confirmed', 'waitlisted', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."board_position" AS ENUM('president', 'vice_president', 'treasurer');--> statement-breakpoint
CREATE TYPE "public"."confirm_mode" AS ENUM('fcfs', 'manual');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('draft', 'recruiting', 'closed', 'done', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('active', 'expired');--> statement-breakpoint
CREATE TYPE "public"."month_week" AS ENUM('1', '2', '3', '4', 'last');--> statement-breakpoint
CREATE TYPE "public"."naver_token_status" AS ENUM('ok', 'error');--> statement-breakpoint
CREATE TYPE "public"."owner_type" AS ENUM('personal', 'team');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('draft', 'ready', 'scheduled', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('member', 'staff', 'board', 'sysadmin');--> statement-breakpoint
CREATE TYPE "public"."team_kind" AS ENUM('activity', 'functional');--> statement-breakpoint
CREATE TYPE "public"."team_position" AS ENUM('leader', 'member');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('member', 'staff', 'board');--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "application_status" DEFAULT 'applied' NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	CONSTRAINT "applications_event_user_uq" UNIQUE("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_table" text NOT NULL,
	"target_id" text,
	"before_json" jsonb,
	"after_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boards" (
	"menuid" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"purpose" text,
	"bot_can_write" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"role_at_time" "role" NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"sources" text[],
	"handed_off" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(768),
	CONSTRAINT "doc_chunks_doc_idx_uq" UNIQUE("document_id","chunk_index")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content_md" text NOT NULL,
	"visibility" "visibility" DEFAULT 'member' NOT NULL,
	"owner_type" "owner_type" NOT NULL,
	"owner_id" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pii_checked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"rule_id" uuid,
	"title" text NOT NULL,
	"event_date" date,
	"meet_time" time,
	"place" text,
	"capacity" integer,
	"confirm_mode" "confirm_mode" DEFAULT 'fcfs' NOT NULL,
	"status" "event_status" DEFAULT 'draft' NOT NULL,
	"openchat_url" text,
	"openchat_code" text,
	"scheduled_post_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"target_role" "role" NOT NULL,
	"target_team" uuid,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"invited_by" uuid NOT NULL,
	CONSTRAINT "invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"board_position" "board_position",
	"term_start" date NOT NULL,
	"term_end" date NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naver_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"last_refreshed_at" timestamp with time zone,
	"status" "naver_token_status" DEFAULT 'ok' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"label" text NOT NULL,
	"month_week" "month_week" NOT NULL,
	"weekday" smallint NOT NULL,
	"time" time NOT NULL,
	"board_menuid" integer NOT NULL,
	"template_md" text NOT NULL,
	"draft_lead_days" integer DEFAULT 3 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" "owner_type" NOT NULL,
	"owner_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"board_menuid" integer NOT NULL,
	"title" text NOT NULL,
	"content_md" text NOT NULL,
	"image_urls" text[],
	"publish_at" timestamp with time zone,
	"status" "post_status" DEFAULT 'draft' NOT NULL,
	"cafe_article_url" text,
	"fail_reason" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"position" "team_position" NOT NULL,
	CONSTRAINT "team_members_team_user_uq" UNIQUE("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "team_kind" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_logs" ADD CONSTRAINT "chat_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_chunks" ADD CONSTRAINT "doc_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_rule_id_recurring_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."recurring_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_scheduled_post_id_scheduled_posts_id_fk" FOREIGN KEY ("scheduled_post_id") REFERENCES "public"."scheduled_posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_target_team_teams_id_fk" FOREIGN KEY ("target_team") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_board_menuid_boards_menuid_fk" FOREIGN KEY ("board_menuid") REFERENCES "public"."boards"("menuid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_board_menuid_boards_menuid_fk" FOREIGN KEY ("board_menuid") REFERENCES "public"."boards"("menuid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doc_chunks_embedding_idx" ON "doc_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "scheduled_posts_due_idx" ON "scheduled_posts" USING btree ("status","publish_at");--> statement-breakpoint
-- RLS 전면 활성화(정책 미부여 = 기본 거부, CLAUDE.md 규칙 #8). service role 은 RLS 를 우회하며,
-- 데이터 접근은 전부 Next.js 서버(service role) 경유. anon/authenticated 는 직접 접근 전면 차단.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "teams" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "team_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "boards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "naver_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recurring_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "doc_chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chat_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;