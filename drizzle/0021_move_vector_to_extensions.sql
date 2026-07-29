-- pgvector 를 public → extensions 스키마로 옮긴다.
--
-- 왜: Supabase Security Advisor 의 `extension_in_public`(WARN) 경고. public 에 설치된 확장은
--     그 스키마에 객체를 만들 수 있는 롤이 있으면 search_path 로 함수를 가로챌 수 있다.
--     이 프로젝트에서는 anon/authenticated/PUBLIC 모두 public 에 CREATE 권한이 없어(USAGE 만)
--     실제 공격 경로는 없지만, 심층 방어이고 지금이 가장 싸다 — doc_chunks 가 사실상 비어 있다
--     (운영 2행/테스트 0행). 문서를 채운 뒤에는 같은 작업이 무거워진다.
--
-- 안전한 이유: vector v0.8.2 는 extrelocatable=true 이고, 운영·테스트 양쪽 모두 앱이 `postgres`
--     롤로 붙으며 search_path 가 이미 `"$user", public, extensions` 다. 따라서
--     src/rag/search.ts 의 미자격 `::vector`·`<=>` 와 schema.ts 의 `vector_cosine_ops` 가
--     그대로 해석된다. 컬럼 타입(vector(768))과 HNSW 인덱스는 OID 로 묶여 있어 재생성이 필요 없다.
--     테스트 DB 에서 이전 후 통합 테스트 141개가 그대로 통과하는 것을 확인했다.
--
-- 멱등: 이미 옮겨진 DB(테스트)에서 두 번 돌아도 실패하지 않도록 public 에 있을 때만 실행한다.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'vector' AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION vector SET SCHEMA extensions;
  END IF;
END $$;
