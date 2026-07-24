CREATE TABLE "rate_limits" (
	"bucket" text NOT NULL,
	"identifier" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limits_pk" ON "rate_limits" USING btree ("bucket","identifier","window_start");--> statement-breakpoint
CREATE INDEX "rate_limits_window_idx" ON "rate_limits" USING btree ("window_start");--> statement-breakpoint
-- RLS 전면 활성화(정책 미부여 = 기본 거부, CLAUDE.md 규칙 #8) — 신규 테이블.
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;