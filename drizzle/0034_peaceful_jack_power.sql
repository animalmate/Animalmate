ALTER TYPE "public"."guidebook_status" ADD VALUE 'extracting' BEFORE 'extracted';--> statement-breakpoint
CREATE TABLE "club_guidebooks" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"storage_path" text NOT NULL,
	"file_name" text NOT NULL,
	"file_bytes" integer NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_guidebooks_singleton" CHECK ("club_guidebooks"."id" = 'club')
);
--> statement-breakpoint
ALTER TABLE "club_guidebooks" ADD CONSTRAINT "club_guidebooks_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- RLS 기본 거부(CLAUDE.md 규칙 #8). db:generate 는 이 구문을 만들어 주지 않으므로 손으로 넣는다.
-- 정책을 부여하지 않으므로 anon/authenticated 키로는 어떤 행도 읽거나 쓸 수 없다.
-- 접근은 전부 Next.js 서버(service role) 경유. test/rls.security.test.ts 가 이것을 증명한다.
ALTER TABLE "club_guidebooks" ENABLE ROW LEVEL SECURITY;
