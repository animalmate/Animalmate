CREATE TYPE "public"."recruit_result_mail_stage" AS ENUM('document', 'interview', 'final');--> statement-breakpoint
CREATE TYPE "public"."recruit_result_mail_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "recruit_result_mails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_id" uuid NOT NULL,
	"stage" "recruit_result_mail_stage" NOT NULL,
	"status" "recruit_result_mail_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"queued_by" uuid,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "recruit_result_mails_uq" UNIQUE("applicant_id","stage")
);
--> statement-breakpoint
ALTER TABLE "recruit_result_mails" ADD CONSTRAINT "recruit_result_mails_applicant_id_recruit_applicants_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."recruit_applicants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruit_result_mails" ADD CONSTRAINT "recruit_result_mails_queued_by_users_id_fk" FOREIGN KEY ("queued_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recruit_result_mails_status_idx" ON "recruit_result_mails" USING btree ("status","sent_at");--> statement-breakpoint
-- RLS 기본 거부(CLAUDE.md 규칙 #8). db:generate 는 이 구문을 만들어 주지 않으므로 손으로 넣는다.
-- 정책을 부여하지 않으므로 anon/authenticated 키로는 어떤 행도 읽거나 쓸 수 없다.
-- 접근은 전부 Next.js 서버(service role) 경유. test/rls.security.test.ts 가 이것을 증명한다.
ALTER TABLE "recruit_result_mails" ENABLE ROW LEVEL SECURITY;
