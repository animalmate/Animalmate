-- public 스키마에 대한 anon/authenticated 권한을 회수한다 (규칙 #8 의 두 번째 방어선).
--
-- 왜: 운영 DB 에는 anon·authenticated 에 public 전 테이블 ALL PRIVILEGES 가 부여돼 있었다
--     (SELECT·INSERT·UPDATE·DELETE·TRUNCATE 까지, 27개 테이블 × 2롤). 구버전 Supabase
--     프로젝트의 기본값이다. RLS 가 막고 있어 실피해는 없었지만 — anon SELECT 가
--     `HTTP 200 []` 를 반환했다. 즉 요청이 테이블까지 도달했고 RLS 가 마지막에 걸러낸 것이다.
--     **안전망이 한 겹뿐**이라, 새 테이블에 ENABLE ROW LEVEL SECURITY 를 한 줄 빠뜨리면
--     (= db:generate 가 만들어 주지 않아 매번 손으로 넣어야 하는 그 구문) 그 테이블은
--     즉시 anon key 로 읽기·쓰기까지 뚫린다. 2026-07-27 사고가 그 형태였다.
--
-- service_role 은 건드리지 않는다: 서버 전용 키(src/storage/notice-images.ts 가 Storage REST 에
--     쓴다)이고, 유출되면 어차피 RLS 를 우회하므로 회수해도 공격면이 줄지 않는다.
--     공개되는 것은 anon key 이고, authenticated 는 그 anon key 로 Supabase Auth 가입을 하면
--     얻을 수 있다 — 실제 표적은 이 둘이다.
--
-- ⚠ 기존 부여를 지우는 것만으로는 반쪽이다. public 스키마에 ALTER DEFAULT PRIVILEGES 가 걸려
--    있어서 **앞으로 만드는 테이블이 다시 자동으로 권한을 받는다.** 아래 두 번째 블록이 그것을 끊는다.
--    (테스트 DB 는 신규 프로젝트라 이 기본 권한이 애초에 없다 — 그래서 부여도 0건이었다.)
--
-- 앱 영향 없음: 앱은 anon key 를 전혀 쓰지 않고 `postgres` 롤로 직접 붙는다. anon key 의 유일한
--    사용처는 test/rls.security.test.ts(거부 증명용)이며, 그 테스트는 이미 4xx 를 "접근 거부 =
--    안전"으로 처리한다(200 + 행 반환만이 위험). 단언문 수정이 필요 없다.
--
-- 멱등: REVOKE 는 없는 권한에 대해 no-op 이고, ALTER DEFAULT PRIVILEGES REVOKE 도 마찬가지다.

-- 1) 이미 부여된 권한 회수
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;--> statement-breakpoint

-- 2) 앞으로 만들 객체에 자동 부여되지 않도록 기본 권한을 끊는다.
--    마이그레이션은 `postgres` 롤로 돌므로, 이 리포가 만드는 테이블에 적용되는 것은 이 항목이다.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;--> statement-breakpoint

-- 3) supabase_admin 이 만드는 객체 몫. `postgres` 가 그 롤의 멤버가 아니면 권한 부족으로 실패하는데,
--    우리 마이그레이션이 만드는 테이블과는 무관하므로 실패해도 진행한다(경고만 남긴다).
DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated';
EXCEPTION WHEN insufficient_privilege OR undefined_object THEN
  RAISE NOTICE 'supabase_admin 기본 권한은 건드리지 못했다(권한 부족). 이 리포의 마이그레이션은 postgres 롤로 돌므로 영향 없음.';
END $$;
