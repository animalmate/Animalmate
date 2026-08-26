# Phase 0 검증 스크립트

네이버 카페 글쓰기 API가 실제로 동작하는지 확인하는 **GO/NO-GO 게이트** 도구다.
외부 의존성이 없다(**Node 18+** 내장 `fetch`/`FormData`/`Blob` 사용). `npm install` 불필요.

> Phase 0을 통과(GO)하기 전에는 Phase 1(Next.js/Supabase) 코드를 쓰지 않는다 — `04-TODO.md` 규칙.

## 사전 준비
1. 프로젝트 루트에 `.env` 생성 (`env.example` 복사) — **커밋 금지**, `.gitignore`로 차단됨.
2. 아래 값 채우기:
   - `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` — 네이버 개발자센터 앱
   - `NAVER_CAFE_CLUB_ID` — 대상 카페 clubid
   - `NAVER_REFRESH_TOKEN` — `naver-token.mjs` 로 발급(아래 실행 순서 1번)
   - `NAVER_TEST_MENUID` — **테스트 게시판** menuid (실제 공지 게시판 금지)

## 실행 순서
```bash
# 1) refresh token 발급 (최초 1회) — 브라우저 OAuth 동의
#    사전: 개발자센터 앱에 Callback URL http://localhost:3000/callback 등록 필요.
node scripts/naver-token.mjs
#    출력된 refresh token 을 .env 의 NAVER_REFRESH_TOKEN 에 붙여넣고 금고에도 저장한다.

# 2) 글쓰기 3종 검증 (텍스트 / 이미지 1장 / 이미지 2장)
#    시작 시 refresh token 으로 access token 을 자동 갱신한다.
node scripts/verify-cafe-write.mjs

# (선택) refresh token → access token 수동 갱신만 점검하고 싶을 때
node scripts/refresh-cafe-token.mjs
```

## 통과 기준(DoD)
- `naver-token.mjs` 가 refresh token 발급 성공 → `.env`/금고에 저장.
- `verify-cafe-write.mjs` 가 **3/3 성공**하고 각 글의 카페 URL을 출력(내부에서 access token 자동 갱신).
- 콘솔에서 확인한 **일일 호출 한도** 수치를 `docs/05-ASSET-REGISTRY.md` 에 기록.

## 주의
- 카페 API는 **글쓰기(POST)만** 있고 **수정/삭제/댓글 API는 없다**. 검증으로 게시된 글은
  사람이 카페에서 직접 삭제해야 한다. 반드시 테스트 게시판에서만 실행할 것.
- 연속으로 빠르게 게시하면 네이버가 `code 999`("연속으로 등록할 수 없습니다")로 막는다(권한
  아님, 레이트리밋). 스크립트는 케이스 사이에 기본 20초 지연을 둔다(`NAVER_CASE_DELAY_MS` 로 조절).
  **실운영 발행 워커도 건별 간격이 필요**하다.
- 토큰/시크릿을 절대 커밋하지 말 것(`00 규칙 #4`). 이 스크립트는 토큰을 마스킹해 출력하지만,
  "복사용" 전체 값이 터미널 히스토리에 남으니 검증 후 히스토리를 정리한다.

## 실패 시(NO-GO) 폴백
글쓰기 API 검증이 실패하면 `04-TODO.md` GO/NO-GO 항목에 따라 **반자동 복붙 발행**
(시스템이 초안 완성 → 담당자가 카페에 수동 게시)을 채택할지 회장단과 결정하고 기록한다.

---

## 그 밖의 운영 스크립트

### `sync-rag-docs.ts` — 사이트 안내 문서를 챗봇 지식베이스에 올린다
```bash
npx tsx --conditions=react-server scripts/sync-rag-docs.ts --actor <userId>          # 미리보기
npx tsx --conditions=react-server scripts/sync-rag-docs.ts --actor <userId> --apply  # 실제 저장
```
`docs/rag/0{1,2,3}-site-guide-*.md` 를 `documents` 에 올린다(제목이 같으면 교체 + 재임베딩).
`/documents` 화면에 손으로 붙여넣던 일을 대신한다 — **공개 범위를 스크립트가 정한다**는 것이 요점이다.
회장단 문서를 실수로 staff 로 올리면 운영진 전원에게 새고, 되돌려도 이미 읽힌 뒤다.
표는 `docs/rag/README.md` 와 스크립트의 `PLAN` 두 곳에만 있다.

- `--actor` 는 **회장단·시스템관리자** 계정이어야 한다(`document.modify`).
- `--apply` 없이 돌리면 무엇이 신규/교체인지만 보여 주고 아무것도 쓰지 않는다.
- `--conditions=react-server` 는 빼면 안 된다 — `@/rag/gemini` 의 `server-only` 가드가 걸린다.
- PII 가 잡히면 저장이 막힌다(`PiiBlockedError`). 안내 문서에 명단·연락처를 적지 말라는 규칙의 실행부다.


### `recruit-scale-report.mjs` — 모집 기수 규모 점검(읽기 전용)
```bash
node scripts/recruit-scale-report.mjs          # 지원자가 가장 많은 기수
node scripts/recruit-scale-report.mjs 33기     # 기수 이름으로 지정
```
지원자 수 · 지원서 전문 무게(화면이 한 번에 받는 양) · 자기소개 길이 · 채점 진척 ·
면접 슬롯 현황을 한 화면에 뽑는다. **아무것도 쓰지 않고, 이름·전화·자기소개 본문을 출력하지 않는다**
(길이와 개수만 센다 — 터미널 기록에 실명이 남으면 안 된다).

쓰는 때: 기수 인원이 이전과 크게 다를 때, "화면이 느리다"는 말이 나왔을 때 코드를 고치기 전에.
33기(203명)에서 무거웠던 것은 조회 자체가 아니라 **채점할 때마다 명단을 다시 받던 반복**이었다
(07-DECISIONS 119).
