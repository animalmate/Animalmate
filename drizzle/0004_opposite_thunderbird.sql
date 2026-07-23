ALTER TYPE "public"."owner_type" ADD VALUE 'global';--> statement-breakpoint
CREATE TABLE "notice_check_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scheduled_post_id" uuid NOT NULL,
	"notice_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notice_check_uq" UNIQUE("scheduled_post_id","notice_date")
);
--> statement-breakpoint
CREATE TABLE "post_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" "owner_type" NOT NULL,
	"owner_id" uuid,
	"name" text NOT NULL,
	"title_template" text NOT NULL,
	"body_template" text NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_scheduled_post_id_scheduled_posts_id_fk";
--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "notice_check_log" ADD CONSTRAINT "notice_check_log_scheduled_post_id_scheduled_posts_id_fk" FOREIGN KEY ("scheduled_post_id") REFERENCES "public"."scheduled_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_templates" ADD CONSTRAINT "post_templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "scheduled_post_id";--> statement-breakpoint
ALTER TABLE "recurring_rules" DROP COLUMN "template_md";--> statement-breakpoint
ALTER TABLE "recurring_rules" DROP COLUMN "draft_lead_days";--> statement-breakpoint
-- RLS 전면 활성화(기본 거부, 규칙 #8) — 신규 테이블.
ALTER TABLE "post_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notice_check_log" ENABLE ROW LEVEL SECURITY;