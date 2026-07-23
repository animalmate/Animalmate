CREATE TYPE "public"."email_code_purpose" AS ENUM('signup', 'login');--> statement-breakpoint
CREATE TABLE "email_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"purpose" "email_code_purpose" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "join_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"semester_label" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "join_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "join_codes" ADD CONSTRAINT "join_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_codes_email_purpose_idx" ON "email_codes" USING btree ("email","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "join_codes_single_active" ON "join_codes" USING btree ("is_active") WHERE "join_codes"."is_active";--> statement-breakpoint
-- RLS 전면 활성화(기본 거부, 규칙 #8). 서버(service role) 경유만 접근.
ALTER TABLE "join_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_codes" ENABLE ROW LEVEL SECURITY;