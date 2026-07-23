-- event_status 단순화: recruiting/closed 제거, published 추가 (신청 기능 폐기, 결정 2026-07-23).
-- 컬럼 DEFAULT 가 구 타입에 의존하므로 DROP TYPE 전에 DEFAULT 를 먼저 떼고, 재생성 후 복원한다.
ALTER TABLE "public"."events" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."events" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."event_status";--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('draft', 'published', 'done', 'canceled');--> statement-breakpoint
ALTER TABLE "public"."events" ALTER COLUMN "status" SET DATA TYPE "public"."event_status" USING "status"::"public"."event_status";--> statement-breakpoint
ALTER TABLE "public"."events" ALTER COLUMN "status" SET DEFAULT 'draft';
