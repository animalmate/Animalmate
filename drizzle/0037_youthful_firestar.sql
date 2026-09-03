ALTER TABLE "flash_meetups" ADD COLUMN "signup_open_at" timestamp with time zone;
-- RLS 는 이미 flash_meetups 에 켜져 있다(0036). 컬럼 추가는 그것을 건드리지 않는다 —
-- 새 **테이블**을 더할 때만 ENABLE ROW LEVEL SECURITY 를 손으로 넣으면 된다(CLAUDE.md 규칙 #8).
-- 기존 행은 signup_open_at 이 NULL 이 되고, 그것은 "올라간 때부터 바로 신청"이라는 뜻이다.
