CREATE TYPE "public"."recruit_score_stage" AS ENUM('document', 'interview');--> statement-breakpoint
CREATE TYPE "public"."recruit_status" AS ENUM('received', 'doc_fail', 'doc_pass', 'interview_done', 'interview_noshow', 'final_pass', 'final_fail');--> statement-breakpoint
CREATE TABLE "recruit_applicants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"name" text NOT NULL,
	"gender" text,
	"birth_date" text,
	"phone" text NOT NULL,
	"school" text,
	"department" text,
	"email" text,
	"apply_route" text,
	"other_activities" text,
	"expected_frequency" text,
	"wish_team1" text,
	"wish_team2" text,
	"near_station" text,
	"ot_attend" text,
	"remote_interview_wish" text,
	"essay_intro" text,
	"essay_values" text,
	"status" "recruit_status" DEFAULT 'received' NOT NULL,
	"slot_id" uuid,
	"interview_link" text,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruit_cohorts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"schedule_public" boolean DEFAULT false NOT NULL,
	"result_public" boolean DEFAULT false NOT NULL,
	"closed_at" timestamp with time zone,
	"archived_stats" jsonb,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruit_cohorts_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "recruit_mapping_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"mapping" jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruit_mapping_presets_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "recruit_memos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruit_memos_uq" UNIQUE("applicant_id","author_user_id")
);
--> statement-breakpoint
CREATE TABLE "recruit_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_id" uuid NOT NULL,
	"scorer_user_id" uuid NOT NULL,
	"stage" "recruit_score_stage" NOT NULL,
	"score" numeric(3, 1) NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruit_scores_uq" UNIQUE("applicant_id","scorer_user_id","stage")
);
--> statement-breakpoint
CREATE TABLE "recruit_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_min" integer DEFAULT 20 NOT NULL,
	"link" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screen_notes" (
	"context_key" text PRIMARY KEY NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recruit_applicants" ADD CONSTRAINT "recruit_applicants_cohort_id_recruit_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."recruit_cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruit_applicants" ADD CONSTRAINT "recruit_applicants_slot_id_recruit_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."recruit_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruit_applicants" ADD CONSTRAINT "recruit_applicants_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruit_cohorts" ADD CONSTRAINT "recruit_cohorts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruit_mapping_presets" ADD CONSTRAINT "recruit_mapping_presets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruit_memos" ADD CONSTRAINT "recruit_memos_applicant_id_recruit_applicants_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."recruit_applicants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruit_memos" ADD CONSTRAINT "recruit_memos_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruit_scores" ADD CONSTRAINT "recruit_scores_applicant_id_recruit_applicants_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."recruit_applicants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruit_scores" ADD CONSTRAINT "recruit_scores_scorer_user_id_users_id_fk" FOREIGN KEY ("scorer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruit_slots" ADD CONSTRAINT "recruit_slots_cohort_id_recruit_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."recruit_cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruit_slots" ADD CONSTRAINT "recruit_slots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screen_notes" ADD CONSTRAINT "screen_notes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recruit_applicants_cohort_idx" ON "recruit_applicants" USING btree ("cohort_id");--> statement-breakpoint
-- 채점 값 검증: 0.0~10.0, 0.5 단위(서비스 검증 + DB CHECK 이중 방어). --> statement-breakpoint
ALTER TABLE "recruit_scores" ADD CONSTRAINT "recruit_scores_range_ck" CHECK ("score" >= 0 AND "score" <= 10 AND ("score" * 2) = floor("score" * 2));--> statement-breakpoint
-- RLS 전 테이블 활성화(정책 미부여 = 기본 거부, 규칙 #8). 접근은 서버 service role 경유. --> statement-breakpoint
ALTER TABLE "recruit_cohorts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recruit_slots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recruit_applicants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recruit_scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recruit_memos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "screen_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recruit_mapping_presets" ENABLE ROW LEVEL SECURITY;