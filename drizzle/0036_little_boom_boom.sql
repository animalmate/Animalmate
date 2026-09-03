CREATE TYPE "public"."flash_signup_status" AS ENUM('confirmed', 'waitlisted', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."flash_status" AS ENUM('pending', 'open', 'closed', 'canceled', 'rejected');--> statement-breakpoint
CREATE TABLE "flash_hosts" (
	"flash_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "flash_hosts_uq" UNIQUE("flash_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "flash_meetups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"meet_date" date NOT NULL,
	"meet_time" time,
	"place" text,
	"details" text,
	"capacity" integer,
	"status" "flash_status" DEFAULT 'pending' NOT NULL,
	"created_by" uuid NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flash_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signup_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flash_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flash_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "flash_signup_status" DEFAULT 'confirmed' NOT NULL,
	"seq" integer NOT NULL,
	"applicant_read_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"canceled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flash_signups_uq" UNIQUE("flash_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "flash_hosts" ADD CONSTRAINT "flash_hosts_flash_id_flash_meetups_id_fk" FOREIGN KEY ("flash_id") REFERENCES "public"."flash_meetups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flash_hosts" ADD CONSTRAINT "flash_hosts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flash_meetups" ADD CONSTRAINT "flash_meetups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flash_meetups" ADD CONSTRAINT "flash_meetups_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flash_messages" ADD CONSTRAINT "flash_messages_signup_id_flash_signups_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."flash_signups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flash_messages" ADD CONSTRAINT "flash_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flash_signups" ADD CONSTRAINT "flash_signups_flash_id_flash_meetups_id_fk" FOREIGN KEY ("flash_id") REFERENCES "public"."flash_meetups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flash_signups" ADD CONSTRAINT "flash_signups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flash_signups" ADD CONSTRAINT "flash_signups_canceled_by_users_id_fk" FOREIGN KEY ("canceled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flash_meetups_date_idx" ON "flash_meetups" USING btree ("meet_date");--> statement-breakpoint
CREATE INDEX "flash_messages_thread_idx" ON "flash_messages" USING btree ("signup_id","created_at");--> statement-breakpoint
CREATE INDEX "flash_signups_order_idx" ON "flash_signups" USING btree ("flash_id","seq");--> statement-breakpoint
-- RLS 기본 거부(CLAUDE.md 규칙 #8). db:generate 는 이 구문을 만들어 주지 않으므로 손으로 넣는다.
-- 정책을 부여하지 않으므로 anon/authenticated 키로는 어떤 행도 읽거나 쓸 수 없다.
-- 접근은 전부 Next.js 서버(service role) 경유. test/rls.security.test.ts 가 이것을 증명한다.
-- 번개는 특히 중요하다 — flash_messages 에는 회원끼리 주고받은 사적인 대화가 들어간다.
ALTER TABLE "flash_meetups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "flash_hosts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "flash_signups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "flash_messages" ENABLE ROW LEVEL SECURITY;
