CREATE TABLE "recruit_duty_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"duty" text NOT NULL,
	"user_id" uuid,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruit_duty_assignments_uq" UNIQUE("cohort_id","starts_at","duty")
);
--> statement-breakpoint
ALTER TABLE "recruit_cohorts" ADD COLUMN "duty_roles" jsonb;--> statement-breakpoint
ALTER TABLE "recruit_duty_assignments" ADD CONSTRAINT "recruit_duty_assignments_cohort_id_recruit_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."recruit_cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruit_duty_assignments" ADD CONSTRAINT "recruit_duty_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruit_duty_assignments" ADD CONSTRAINT "recruit_duty_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- 규칙 #8: RLS 기본 거부(정책 없음 = anon key 로 직접 접근 전면 차단).
-- drizzle-kit generate 는 이 구문을 만들어 주지 않는다 — 새 테이블마다 손으로 넣어야 하고,
-- 빠뜨리면 회원·지원자 정보가 anon key 로 뚫린다(2026-07-27 실제 사고).
ALTER TABLE "recruit_duty_assignments" ENABLE ROW LEVEL SECURITY;