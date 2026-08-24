CREATE TYPE "public"."recruit_review_mark" AS ENUM('drop', 'move');--> statement-breakpoint
ALTER TABLE "recruit_applicants" ADD COLUMN "review_mark" "recruit_review_mark";--> statement-breakpoint
ALTER TABLE "recruit_applicants" ADD COLUMN "review_move_team" text;