DROP TABLE "applications" CASCADE;--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "confirm_mode";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "openchat_url";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "openchat_code";--> statement-breakpoint
DROP TYPE "public"."application_status";--> statement-breakpoint
DROP TYPE "public"."confirm_mode";