-- 죽은 테이블 정리: invites, recurring_rules (둘 다 0행, 참조 코드 없음)
--   invites          → 학기별 가입코드(join_codes)가 대체(결정 2)
--   recurring_rules  → 일괄 생성 폐기(2026-07-24)와 함께 코드가 전부 사라졌다
--   events.rule_id   → recurring_rules 만 참조하던 컬럼
--
-- ⚠ 배포 순서가 평소와 반대다. **코드 배포 먼저, 마이그레이션 나중.**
--    컬럼을 추가할 때는 migrate 를 먼저 해야 하지만(없는 컬럼 조회 → 500), 지울 때는
--    옛 코드가 아직 rule_id 를 SELECT 하므로 코드가 먼저 나가야 한다.

ALTER TABLE "invites" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recurring_rules" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- CASCADE 가 events 의 FK 제약까지 함께 떨어뜨린다.
DROP TABLE "invites" CASCADE;--> statement-breakpoint
DROP TABLE "recurring_rules" CASCADE;--> statement-breakpoint
-- 위 CASCADE 로 이미 사라졌다. drizzle-kit 이 넣어 준 구문을 그대로 두면
-- "constraint does not exist" 로 마이그레이션이 실패하므로 IF EXISTS 를 붙인다.
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_rule_id_recurring_rules_id_fk";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "rule_id";--> statement-breakpoint
DROP TYPE "public"."month_week";
