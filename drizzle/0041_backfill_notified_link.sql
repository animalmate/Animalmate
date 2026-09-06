-- 0040 이 채운 `notified_schedule` 의 **링크 칸만** 다시 맞춘다(2026-09-06).
--
-- 왜: 0040 은 링크를 원문 그대로 지문에 넣었다. 그런데 지원자 조회 화면은 `pickInterviewLink`
-- 를 거쳐 **다듬은 주소**를 보여 준다 — 스킴 없이 붙여 넣은 `meet.google.com/…` 에 `https://`
-- 를 붙인다(`src/recruit/interview-link.ts`, 0039 와 함께 들어왔다). 두 값이 다르면 누가 링크
-- 표기만 고치는 순간 "링크가 바뀌었다"가 되어 **아무것도 안 바뀐 사람에게 변경 안내가 나간다.**
-- 33기 추가모집에 실제로 그런 조가 있었다(스킴 없는 주소, 35명).
--
-- 스키마 변경은 없다. 데이터만 고친다. 여러 번 돌려도 결과가 같다(멱등).
--
-- ⚠ 지문의 **authoritative 정의는 TS**(`scheduleFingerprint` + `pickInterviewLink`)다. 여기 SQL 은
--   이미 저장된 행을 맞추려고 그 규칙을 옮겨 적은 것이고, `new URL()` 이 하는 일 전부를 흉내내지는
--   않는다(스킴을 붙이는 주된 갈래까지만). 적용 뒤 TS 함수로 대조해 불일치 0을 확인할 것.
UPDATE "recruit_result_mails" m
SET "notified_schedule" = (
  SELECT CASE WHEN s."id" IS NULL THEN 'none' ELSE
    '[' || to_json(to_char(s."starts_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text
        || ',' || s."duration_min"::text
        || ',' || to_json(btrim(coalesce(s."venue", '')))::text
        || ',' || to_json(
             CASE
               -- 링크가 없으면 빈 문자열(pickInterviewLink 의 null → '' 과 같다).
               WHEN link.raw = '' THEN ''
               -- 이미 스킴이 있으면 그대로. http·https 가 아니면 화면이 버리므로 여기서도 버린다.
               WHEN link.raw ~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' THEN
                 CASE WHEN lower(link.raw) ~ '^https?:' THEN link.raw ELSE '' END
               -- 스킴이 없으면 https 를 붙인다.
               ELSE 'https://' || link.raw
             END
           )::text
        || ',' || CASE WHEN s."is_remote" THEN 'true' ELSE 'false' END
    || ']'
  END
  FROM "recruit_applicants" a
  LEFT JOIN "recruit_slots" s ON s."id" = a."slot_id"
  CROSS JOIN LATERAL (
    SELECT coalesce(
      nullif(btrim(coalesce(a."interview_link", '')), ''),
      btrim(coalesce(s."link", ''))
    ) AS raw
  ) link
  WHERE a."id" = m."applicant_id"
)
WHERE m."stage" IN ('document', 'interview');
