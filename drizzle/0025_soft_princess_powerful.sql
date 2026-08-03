-- 동아리 일정(캘린더). 챗봇이 tool 로 읽어 답하므로 문서와 달리 썩지 않는다.
--
-- ⚠ 아래 ENABLE ROW LEVEL SECURITY 는 **손으로 넣은 것**이다. drizzle-kit generate 는
--    schema.ts 에 RLS 선언이 없어 이 구문을 만들어 주지 않는다(규칙 #8, 2026-07-27 사고).
--    정책을 하나도 만들지 않는 것이 의도다 = anon/authenticated 키로는 접근 전면 거부.
--    데이터 접근은 전부 Next.js 서버(postgres 롤)를 경유한다.
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"start_time" time,
	"place" text,
	"details" text,
	"visibility" "visibility" DEFAULT 'member' NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schedules_start_idx" ON "schedules" USING btree ("start_date");--> statement-breakpoint
ALTER TABLE "schedules" ENABLE ROW LEVEL SECURITY;