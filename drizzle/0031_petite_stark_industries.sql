CREATE TYPE "public"."document_kind" AS ENUM('manual', 'guidebook');--> statement-breakpoint
CREATE TYPE "public"."guidebook_status" AS ENUM('extracted', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "team_guidebooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"document_id" uuid,
	"storage_path" text NOT NULL,
	"file_name" text NOT NULL,
	"file_bytes" integer NOT NULL,
	"status" "guidebook_status" DEFAULT 'extracted' NOT NULL,
	"pending_text" text,
	"fail_reason" text,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_guidebooks_team_id_unique" UNIQUE("team_id")
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "kind" "document_kind" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "team_guidebooks" ADD CONSTRAINT "team_guidebooks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_guidebooks" ADD CONSTRAINT "team_guidebooks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_guidebooks" ADD CONSTRAINT "team_guidebooks_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- RLS 기본 거부(CLAUDE.md 규칙 #8). db:generate 는 이 구문을 만들어 주지 않으므로 손으로 넣는다.
-- 정책을 부여하지 않으므로 anon/authenticated 키로는 어떤 행도 읽거나 쓸 수 없다.
-- 접근은 전부 Next.js 서버(service role) 경유. test/rls.security.test.ts 가 이것을 증명한다.
ALTER TABLE "team_guidebooks" ENABLE ROW LEVEL SECURITY;
