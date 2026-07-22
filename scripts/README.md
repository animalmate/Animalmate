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
- 토큰/시크릿을 절대 커밋하지 말 것(`00 규칙 #4`). 이 스크립트는 토큰을 마스킹해 출력하지만,
  "복사용" 전체 값이 터미널 히스토리에 남으니 검증 후 히스토리를 정리한다.

## 실패 시(NO-GO) 폴백
글쓰기 API 검증이 실패하면 `04-TODO.md` GO/NO-GO 항목에 따라 **반자동 복붙 발행**
(시스템이 초안 완성 → 담당자가 카페에 수동 게시)을 채택할지 회장단과 결정하고 기록한다.
