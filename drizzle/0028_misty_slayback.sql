ALTER TABLE "recruit_slot_interviewers" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recruit_duty_assignments" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "recruit_slot_interviewers" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "recruit_slot_interviewers" ADD CONSTRAINT "recruit_slot_interviewers_name_uq" UNIQUE("slot_id","name");