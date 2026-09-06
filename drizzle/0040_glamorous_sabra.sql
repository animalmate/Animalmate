-- 결과 안내 메일에 **그 메일이 알린 면접 일정**을 남긴다(2026-09-06).
--
-- 왜: `interview`(면접 일정 변경 안내) 대상이 "doc_pass + 슬롯 배정"이었다. 그것은 **면접 결과가
-- 아직 안 들어간 사람 전원**이라는 뜻이지 일정이 바뀐 사람이 아니다. 33기 추가모집에서 아무것도
-- 바뀌지 않은 64명이 대상으로 잡혔고, 그들은 하루 전 서류 안내로 같은 일정을 이미 받은 사람들이다.
-- "바뀌었는가"를 판정하려면 **그때 무엇을 알렸는지**가 남아 있어야 한다. 그 자리를 만든다.
--
-- 이 컬럼은 PII 가 아니다 — 시각·소요시간·장소·링크뿐이고 이름·연락처는 들어가지 않는다
-- (같은 테이블에 이메일을 복사하지 않는 이유와 같은 선이다).
ALTER TABLE "recruit_result_mails" ADD COLUMN "notified_schedule" text;--> statement-breakpoint

-- 사람당 한 통(applicant_id, stage)이던 UNIQUE 를 단계별로 갈라 다시 세운다.
ALTER TABLE "recruit_result_mails" DROP CONSTRAINT "recruit_result_mails_uq";--> statement-breakpoint

-- 서류·최종은 예전 그대로 사람당 딱 한 통.
CREATE UNIQUE INDEX "recruit_result_mails_once_uq"
  ON "recruit_result_mails" ("applicant_id", "stage")
  WHERE "stage" <> 'interview'::"public"."recruit_result_mail_stage";--> statement-breakpoint

-- 변경 안내는 **일정이 바뀔 때마다** 나가야 한다. 사람당 한 통으로 묶으면 두 번째 변경을 알릴 수
-- 없다(그 자체가 이 마이그레이션이 고치는 것과 같은 종류의 버그다). 대신 같은 일정을 두 번 알리는
-- 것은 막는다 — 버튼을 두 번 눌러도, 미리보기와 확정 사이에 남이 눌러도 두 통이 되지 않는다.
CREATE UNIQUE INDEX "recruit_result_mails_interview_uq"
  ON "recruit_result_mails" ("applicant_id", "notified_schedule")
  WHERE "stage" = 'interview'::"public"."recruit_result_mail_stage";--> statement-breakpoint

-- 이미 나간 메일의 기준선을 채운다: **"마지막으로 알린 일정 = 지금 일정"** 으로 둔다.
--
-- 뜻: 이 마이그레이션 이전에 일어난 변경은 없던 일로 본다. 안전한 쪽이다 — 기준선이 NULL 이면
-- 그 사람은 이후 일정이 바뀌어도 영영 대상이 되지 않고(못 보냄), 반대로 아무 값이나 넣으면
-- 바뀌지도 않은 사람에게 메일이 나간다(잘못 보냄). 못 보내는 쪽은 운영진이 눈으로 잡을 수 있고,
-- 잘못 보낸 메일은 되돌릴 수 없다.
-- (2026-09-06 운영 확인: 33기 추가모집의 서류 안내 발송 이후 슬롯 배정·시각 변경 audit 이 0건.
--  즉 이 기수에서는 "없던 일로 본다"가 실제로도 사실과 같다.)
--
-- 지문 형식은 `src/recruit/result-mail-rules.ts` 의 `scheduleFingerprint` 와 **글자까지 같아야**
-- 한다: JSON 배열 [시작시각ISO, 소요분, 장소, 링크, 비대면여부], 공백 없음, 개인 링크가 슬롯
-- 링크보다 우선(`lookup.ts` 와 같은 규칙).
UPDATE "recruit_result_mails" m
SET "notified_schedule" = (
  SELECT CASE WHEN s."id" IS NULL THEN 'none' ELSE
    '[' || to_json(to_char(s."starts_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text
        || ',' || s."duration_min"::text
        || ',' || to_json(btrim(coalesce(s."venue", '')))::text
        || ',' || to_json(coalesce(
             nullif(btrim(coalesce(a."interview_link", '')), ''),
             btrim(coalesce(s."link", ''))
           ))::text
        || ',' || CASE WHEN s."is_remote" THEN 'true' ELSE 'false' END
    || ']'
  END
  FROM "recruit_applicants" a
  LEFT JOIN "recruit_slots" s ON s."id" = a."slot_id"
  WHERE a."id" = m."applicant_id"
)
WHERE m."stage" IN ('document', 'interview');
