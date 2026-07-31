ALTER TABLE "users" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
-- 기존 회원은 "가입 시점"으로 채운다. 비워 두면 만료 판정이 NULL 과 비교하게 되어, 코드가 NULL 을
-- 어떻게 보느냐에 따라 아무도 안 만료되거나 전원이 만료되는 갈림길이 생긴다.
-- 판정 쿼리도 coalesce(last_seen_at, created_at) 로 한 번 더 막지만, 값 자체를 채워 두는 편이 명확하다.
UPDATE "users" SET "last_seen_at" = "created_at" WHERE "last_seen_at" IS NULL;--> statement-breakpoint
-- 일일 크론이 "오래 안 들어온 사람"을 훑는 유일한 조건이라 인덱스를 둔다.
CREATE INDEX IF NOT EXISTS "users_last_seen_idx" ON "users" ("last_seen_at");
