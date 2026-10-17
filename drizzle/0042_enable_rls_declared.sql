-- 0042. schema.ts 에 RLS 를 **선언**한다(2026-10-17 보안 감사). DB 쪽은 바뀌는 것이 없다.
--
-- 배경: 2026-07-27 `drizzle-kit push` 가 schema.ts 에 RLS 선언이 없는 것을 보고 public 전 테이블의
-- RLS 를 꺼버렸다(0014 로 복구). 그때부터 규칙은 "push 금지"였지만, 그건 사람이 지켜야 성립하는 방어다.
-- 이제 모든 pgTable 에 `.enableRLS()` 를 붙여 **스키마 정의 자체가 RLS 켜짐을 말하게** 했다 —
-- 실수로 push 해도 끄지 않고, 이후 generate 도 이 상태를 기준으로 비교한다.
--
-- 아래 문장은 전부 이미 켜진 RLS 를 다시 켜는 것이라 아무 일도 일어나지 않는다(멱등).
-- 정책(policy)은 만들지 않는다 — 규칙 #8: 정책 0개 = anon key 전면 거부, 접근은 서버 경유만.
-- 새 테이블을 만들 때도 `.enableRLS()` 를 붙일 것(빠뜨리면 rls.security.test 가 운영에서 잡는다).
ALTER TABLE "app_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "boards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chat_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "club_guidebooks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "doc_chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "flash_hosts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "flash_meetups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "flash_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "flash_signups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "join_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "naver_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notice_check_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "post_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recruit_applicants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recruit_cohorts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recruit_duty_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recruit_memos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recruit_result_mails" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recruit_scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recruit_slot_interviewers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recruit_slots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "screen_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "team_guidebooks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "team_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "teams" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;