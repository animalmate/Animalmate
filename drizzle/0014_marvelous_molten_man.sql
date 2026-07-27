-- 0014. 스키마 드리프트 정합 + RLS 복구(규칙 #8)
--
-- 배경: 실 DB 에는 아래 컬럼/테이블이 이미 존재하지만 마이그레이션 파일에는 없었다
-- (schema.ts 만 고치고 `drizzle-kit push` 로 밀어넣은 것으로 보인다). 그 결과
--   (a) 마이그레이션만으로 DB 를 재구축하면 스키마가 어긋나고,
--   (b) push 가 schema.ts 에 RLS 선언이 없는 것을 보고 **전 테이블 RLS 를 꺼버렸다**.
-- 이 마이그레이션은 (a) 를 멱등하게 메우고 (b) 를 되돌린다.
-- 이후 이 프로젝트에서 `drizzle-kit push` 는 절대 사용하지 않는다 — 반드시 generate+migrate.

-- ── (a) 드리프트 정합: 실 DB 에 이미 있으므로 전부 IF NOT EXISTS 로 멱등 처리 ──
CREATE TABLE IF NOT EXISTS "recruit_slot_interviewers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruit_slot_interviewers_uq" UNIQUE("slot_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "recruit_applicants" DROP CONSTRAINT IF EXISTS "recruit_applicants_uploaded_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "recruit_applicants" ALTER COLUMN "uploaded_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recruit_applicants" ADD COLUMN IF NOT EXISTS "assigned_team" text;--> statement-breakpoint
ALTER TABLE "recruit_cohorts" ADD COLUMN IF NOT EXISTS "notice_content" text;--> statement-breakpoint
ALTER TABLE "recruit_cohorts" ADD COLUMN IF NOT EXISTS "notice_images" jsonb;--> statement-breakpoint
ALTER TABLE "recruit_cohorts" ADD COLUMN IF NOT EXISTS "congrats_message" text;--> statement-breakpoint
ALTER TABLE "recruit_cohorts" ADD COLUMN IF NOT EXISTS "post_pass_notice" text;--> statement-breakpoint
ALTER TABLE "recruit_cohorts" ADD COLUMN IF NOT EXISTS "is_closed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recruit_cohorts" ADD COLUMN IF NOT EXISTS "venues" jsonb;--> statement-breakpoint
ALTER TABLE "recruit_slots" ADD COLUMN IF NOT EXISTS "venue" text;--> statement-breakpoint
ALTER TABLE "recruit_slots" ADD COLUMN IF NOT EXISTS "is_remote" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- FK 는 IF NOT EXISTS 를 지원하지 않으므로 DROP IF EXISTS 후 재생성(멱등).
ALTER TABLE "recruit_slot_interviewers" DROP CONSTRAINT IF EXISTS "recruit_slot_interviewers_slot_id_recruit_slots_id_fk";--> statement-breakpoint
ALTER TABLE "recruit_slot_interviewers" ADD CONSTRAINT "recruit_slot_interviewers_slot_id_recruit_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."recruit_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruit_slot_interviewers" DROP CONSTRAINT IF EXISTS "recruit_slot_interviewers_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "recruit_slot_interviewers" ADD CONSTRAINT "recruit_slot_interviewers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruit_applicants" ADD CONSTRAINT "recruit_applicants_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- 0013 의 채점 CHECK 도 push 과정에서 유실됐다(0.0~10.0, 0.5 단위 이중 방어). 재생성.
ALTER TABLE "recruit_scores" DROP CONSTRAINT IF EXISTS "recruit_scores_range_ck";--> statement-breakpoint
ALTER TABLE "recruit_scores" ADD CONSTRAINT "recruit_scores_range_ck" CHECK ("score" >= 0 AND "score" <= 10 AND ("score" * 2) = floor("score" * 2));--> statement-breakpoint

-- 슬롯 조회는 항상 cohort 단위 — 0013 에서 누락된 인덱스 보강.
CREATE INDEX IF NOT EXISTS "recruit_slots_cohort_idx" ON "recruit_slots" USING btree ("cohort_id");--> statement-breakpoint

-- ── (b) RLS 복구: public 스키마 전 테이블 강제 활성화(정책 미부여 = 기본 거부, 규칙 #8) ──
-- 테이블 목록을 하드코딩하지 않고 런타임에 수집한다 — 이후 어떤 경로로 테이블이 늘어나도
-- 이 마이그레이션을 재실행하면 빠짐없이 덮는다. drizzle 내부 스키마는 제외.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;
