# 04. 개발 TODO

> 규칙: 위에서 아래로 진행. 각 항목의 DoD(완료 기준)를 만족해야 체크. Phase 0을 통과하지
> 못하면(폴백 결정 전) Phase 1 코드를 쓰지 않는다. 막히면 맨 아래 "질문" 섹션에 기록.

> **진행 요약**: 현재 상태 스냅샷은 **`10-STATUS.md`** 에 있다(여기 옮겨 적지 않는다 — 둘이 어긋난다).
> 한 줄로: Phase 1 + 챗봇 + F9 모집 전부 구현·배포, **2026-07-31 저녁부터 실사용 중**.
> 남은 실질적 공백은 **챗봇 지식 문서**뿐. 각 항목의 *왜* 는 `07-DECISIONS.md`.
>
> ⚠ **로컬 `.env` 의 `NAVER_PUBLISH_DRY_RUN` 은 `true` 로 둔다** — 개발 중 실수로 실카페에 나가는 것을
> 막는 안전장치다. Vercel 만 `false`(2026-07-24 전환). **카페는 수정·삭제 API 가 없어 한번 나간 글은
> 되돌릴 수 없다.**

## Phase 0 — 외부 검증 & 계정 셋업 (캠프 직후 ~8월 말) [GO/NO-GO 게이트]
> 체크 갱신 2026-07-28: **증거가 있는 항목만** 체크했다. 아래 근거를 함께 적어 둔다 —
> "아마 했을 것"으로 체크하면 인수인계 때 안 된 일을 된 것으로 넘기게 된다.
- [~] 동아리 공용 Gmail 생성 (복구 이메일 = 회장 개인 메일)
      → SMTP_USER/PASS 가 설정돼 있어 계정 자체는 있는 것으로 보인다. **복구 이메일 설정 여부는 미확인.**
- [~] 비밀번호 금고 세팅, 자산 대장 문서 시작 (계정/용도/복구수단/비용/갱신일)
      → 자산 대장(`05-ASSET-REGISTRY.md`)은 작성·유지 중. **금고 세팅 여부는 문서로 확인 불가.**
- [x] GitHub Organization 생성, 리포 이전, 개발자 개인 계정 멤버 등록
      → 리포가 `animalmate/Animalmate`(Org 소유), 백업 리포 `animalmate/animalmate-backups` 도 Org 소유.
- [ ] 네이버 조직(단체) 계정 확보 시도 → 불가 시 일반 공용 계정 + 인증 전화번호 대장 기록
- [x] 네이버 개발자센터 앱 등록(조직 계정 소유), 봇 계정 OAuth 동의, 앱 멤버 등록
      → 앱 등록·동의 없이는 글쓰기 실호출이 불가능한데 3/3 성공(2026-07-23). 실카페 발행도 가동 중.
      실행: `node scripts/naver-token.mjs` (앱에 Callback URL http://localhost:3000/callback 등록 필요.
      브라우저 동의 → refresh token 1회 출력 → .env NAVER_REFRESH_TOKEN + 금고에 저장)
- [x] **글쓰기 API 실호출 검증**: 텍스트 / 이미지 multipart / 게시판(menuid) 지정 각 1회 성공
      DoD: 테스트 게시판에 실제 글 3건 게시 + 응답의 글 URL 확보
      실행: `node scripts/verify-cafe-write.mjs` (시작 시 refresh token 자동 갱신 → 3케이스,
      재시도 없음. 출력 끝의 GO/NO-GO 한 줄을 05-ASSET-REGISTRY 검증 표에 기록. 게시글은 수동 삭제)
      → 2026-07-23 [GO] 3/3 성공(menuid 68). 게시글 3건(32987/32988/32989) 수동 삭제 필요.
      ⚠ 연속 게시 시 code 999 레이트리밋 → 발행 워커는 건별 지연 필요(스크립트 기본 20초).
- [x] refresh token 갱신 플로우 검증 (만료 유도 후 자동 갱신 성공)
      → verify 실행 시작 시 refresh→access 갱신 성공 확인(2026-07-23).
- [ ] 개발자센터 콘솔에서 일일 호출 한도 수치 확인·기록
- [ ] 회장단 미팅: 승인·예산(연 5만원 내) 확정, 카페 매니저 계정 명의 확인,
      봇 계정 카페 가입 승인 + 대상 게시판 쓰기 권한(등급) 부여
      → 2026-07-23 확인: 실공지 게시판(예 menuid 12)은 `카페스탭 등급 전용`. 봇 일반 등급으론 못 씀.
      → **2026-07-24 완료: 매니저가 봇 계정을 카페스탭으로 임명.** AP003 해소.
- [x] 전체 게시판 menuid 수집 → 초기 boards 데이터 작성
      → 2026-07-23 19개 게시판 수집, 05-ASSET-REGISTRY 게시판 레지스트리에 기록.
      단, menuid 68(테스트) 외 게시판의 봇 쓰기 가능 여부는 실발행 전 게시판별 확인 필요.
- [x] GO/NO-GO: API 검증 실패 항목이 있으면 폴백(반자동 복붙 발행) 채택 여부 결정·기록
      → **GO**(2026-07-23, 3/3 성공). 폴백 불필요. `05-ASSET-REGISTRY.md` 검증 표에 기록됨.

## Phase 1 — 파일럿: 1개 팀 핵심 루프 (9월 ~ 10월 중순)
### 1A. 기반
- [x] Next.js + Supabase 프로젝트 셋업, 마이그레이션으로 03 스키마 생성
      → 2026-07-23 완료. Next.js 15(App Router)+TS strict, Drizzle+postgres.js.
      `drizzle/0000_*.sql` 적용: 15개 테이블 + pgvector 확장 + **전 테이블 RLS 활성화**(규칙 #8).
      런타임=트랜잭션풀러(6543), 마이그레이션=세션풀러(5432, DIRECT_URL). 검증: 15/15 테이블·RLS·vector OK.
      → **2026-07-24 차원 확정: 768 유지**(07-DECISIONS 15). gemini-embedding-2 는 기본 3072차원이지만
      HNSW 인덱스 한도(2000)를 넘어 불가 → 호출 시 `outputDimensionality=768` 로 축소해서 쓴다.
- [x] 인증: 이메일 OTP 로그인 / **학기별 가입코드** 가입 플로우(코드 수준 완료)
      DoD: 유효한 학기 가입코드 없이는 가입 불가 ✓
      → 2026-07-23 구현: 마이그레이션 0003(join_codes 활성 1개+email_codes OTP, 둘 다 RLS). 서비스
      `src/auth/{join-codes,otp,session,auth-service,mailer,current-user}.ts` + API `src/app/api/auth/*`,
      `/api/admin/join-codes`. 커스텀 HS256 JWT 쿠키 세션. 6자리 OTP(HMAC·만료10분·시도5회). 계정 열거 방지.
      단위(세션/OTP 8) + 통합(가입코드·OTP·가입·로그인 8) + next build 통과.
      **남음: 실메일 발송 테스트(SMTP 신호 후) — 코드는 SMTP_* 없으면 dry 메일러로 동작.**
- [x] 권한 미들웨어: role + membership active + 소유권 검사 공통화 + audit 기록
      DoD: 권한 검사 단위 테스트 통과(부원이 운영진 API 호출 시 403 등 6케이스)
      → 2026-07-23 완료. `src/auth/permissions.ts`(순수 authorize) + `guard.ts`(PermissionError 403,
      guardWrite=검사+audit) + `audit.ts`(buildAuditEntry/recordAudit, override는 [override] 표기).
      단위테스트 23케이스 통과(부원 403, 소유권 not_owner, 회장단 override, 임기만료 거부 등).
- [x] 전 테이블 RLS 활성화(정책 미부여 = 기본 거부), 데이터 접근은 서버 경유로 통일
      DoD: anon key로 각 테이블 직접 조회/쓰기가 전부 거부됨을 테스트로 증명
      → 2026-07-23 완료. 마이그레이션에서 전 테이블 RLS 활성화. `test/rls.security.test.ts`가
      pg_tables 로 테이블을 런타임 수집(새 테이블 자동 포함) → rowsecurity=true + anon SELECT 0행
      + anon INSERT 거부 검증(46통과). RLS 누락 시 실패하는 역검증도 확인. CI(`.github/workflows/ci.yml`)에서 상시 실행.
- [x] Supabase pg_cron + pg_net 셋업: 분 단위 스케줄이 CRON_SECRET 헤더로 /api/cron/* 호출
      (Vercel Cron 사용 금지 — 00 규칙) DoD: 매분 잡이 테스트 엔드포인트에 도달 로그 확인
      → 2026-07-24 완료(사용자). cron.job 2개 등록·active: jobid3 publish 매분(`* * * * *`),
      jobid4 draft-generate 매일(`0 0 * * *`). 프로덕션 헬스 200/db:up. Vercel 배포+환경변수 라이브.
- [x] /api/health(경량 DB 조회) + UptimeRobot 5분 모니터 등록
      DoD: 무료 티어 7일 일시정지 방지 링크 가동 + 다운 알림. → 2026-07-24 UptimeRobot 등록 완료(사용자).
- [~] ~~Supabase Auth 커스텀 SMTP 연결~~ → **해당 없음.** 이 앱은 Supabase Auth 를 쓰지 않고
      자체 OTP(`src/auth/otp.ts`)로 인증한다. 메일은 앱이 직접 보낸다.
      앱 알림 발송 모듈은 **구현 완료**(`src/auth/mailer.ts`, nodemailer + Gmail SMTP):
      OTP·가입 안내·발행 실패·미완성 점검 알림. `SMTP_HOST+USER+PASS` 가 다 있으면 실발송, 없으면 dry.
      **테스트 환경에서는 항상 dry**(2026-07-24 실메일 유출 사고 이후).
      → **실발송 확인 완료(2026-07-31, 사용자).** Vercel SMTP_* 등록·발송 모두 정상.
### 1B. 카페 발행
- [x] boards 레지스트리 CRUD (회장단 전용)
      → 2026-07-23 완료. `src/boards/service.ts`(list/get/create/update/delete). 쓰기=board.registry
      권한(회장단만)+audit(board.create/update/delete), 삭제=소프트(is_active=false, FK·이력 보존).
      통합테스트 `test/boards.service.test.ts` 6케이스(부원 거부, 회장단 CRUD, audit, activeOnly).
      인증 붙으면 app/api/boards 라우트로 얇게 래핑 예정.
- [~] naver_tokens 암호화 저장 + 자동 갱신 잡 + 상태 대시보드 위젯
      → 2026-07-23 코어 완료: `src/crypto/token-cipher.ts`(AES-256-GCM, TOKEN_ENCRYPTION_KEY) +
      `src/naver/oauth.ts`(refresh) + `src/naver/token-service.ts`(store/refreshAndStore, 실패 시
      status=error+NaverTokenError, refresh token 회전 반영). 테스트: 암호화 단위 8 + 서비스 통합 2.
      남음: 자동 갱신 크론 배선(pg_cron 단계) + 상태 대시보드 위젯(인증/프론트).
      부트스트랩 스크립트 완료: `node scripts/bootstrap-token.mjs`(.env NAVER_REFRESH_TOKEN →
      TOKEN_ENCRYPTION_KEY 암호화 → naver_tokens 저장, 성공 시 .env 토큰 제거 안내). 실행은 사용자가
      TOKEN_ENCRYPTION_KEY 생성 후.
- [x] scheduled_posts 작성 화면(제목/본문/이미지/게시판/발행시각) + 상태머신
      → 화면도 완료(`/reservations`, `/reservations/new`, `/reservations/[id]/edit`). 아래 "남음: 작성 UI"는 해소됨.
      → 2026-07-23 상태머신·서비스 완료: `src/publishing/state-machine.ts`(draft→ready→scheduled→
      published|failed, **code 999=rate_limited→failed 아님·대기 후 재시도**, 단위테스트로 증명) +
      `src/publishing/scheduled-posts.ts`(createDraft/markReady[필수값 검증]/schedule/fetchDuePosts/
      applyPublishResult) + `src/naver/cafe-write.ts`(**dry-run 게이트: 기본 dryRun=true, false 명시 시만 실카페**).
      단위 12 + 통합 6. 남음: 작성 UI(인증/프론트).
- [x] 발행 워커(pg_cron 매분 → API): due 소량(≤5건) 처리, 건별 30초 간격, code 999는 대기 후 재시도,
      그 외 재시도 2회, 실패 알림 메일. DoD: 예약 3건이 지정 시각 ±2분 내 카페에 게시되고 URL 저장됨
      → 워커·라우트·pg_cron 잡·실카페 전환까지 완료(2026-07-24). `publishing` 점유 상태로 중복 게시 차단(0017).
      → 2026-07-23 라우트+워커 완료: `src/app/api/cron/publish/route.ts`(CRON_SECRET 검증→워커→JSON 요약)
      + `src/publishing/publish-worker.ts`(due≤5, 실게시 건별 30초, code 999 대기재시도, **처리 요약을
      응답+audit(cron.publish)에 기록**) + `src/http/cron-auth.ts`(상수시간 비교). 인증 단위 5+워커 통합 2.
      토큰 부트스트랩 완료(naver_tokens에 암호화 저장, .env NAVER_REFRESH_TOKEN 제거). pg_cron 잡 등록됨(jobid3 매분).
      + 발행 실패(재시도 소진) 시 회장단 메일 알림(operators.boardEmails), 사이클 중 취소 예약 크래시 방어.
      → **2026-07-24 실게시 전환 완료**: 봇 카페스탭 임명 + Vercel `NAVER_PUBLISH_DRY_RUN=false`.
      로컬 `.env` 는 `true` 유지(개발 중 실수 게시 방지). 워커 기본값도 dry — `'false'` 명시일 때만 실게시.
### 1C. 반복 공지 발행 (F1 — 2026-07-23 재개정: 수동 선예약 중심. 크론 자동 생성 폐기) — 서비스 구현 완료
> 서비스·로직·API 완료(마이그레이션 0004/0005). UI(프론트)만 남음. next build 통과.
- [x] ~~"매월 N번째 X요일" 날짜 계산 유틸~~ **삭제(2026-07-24)** — 일괄 생성과 함께 제거(`src/recurrence/` 전체).
- [x] post_templates CRUD (팀/개인/global) → `src/publishing/post-templates.ts`(template.manage,
      global=회장단만·사용 전원, renderTemplate 플레이스홀더). 단위(render 3)+통합. UI "양식 불러오기"만 남음.
- [x] **장소별 양식 + 발행 직전 치환(2026-07-24, 마이그레이션 0007)**: post_templates 에 기본 장소·정원
      (`default_place/default_capacity`) 추가 → 예약 생성 시 events 초기값으로 복사, 회차별로 다르면 예약
      수정에서 변경. `{{장소}}{{정원}}` 은 본문에 남겨 두고 **발행 직전** events 값으로 치환
      (`src/publishing/final-render.ts`, 순수 치환은 `template-render.ts` — 수정 화면 미리보기와 공용).
      미치환 키가 남으면 완성 처리 차단(markReady) + 워커가 게시 없이 failed 확정(audit `post.blocked`).
      발행 성공 시 최종 본문을 scheduled_posts 에 저장. 단위 9(final-render).
- [x] 직접 선예약 + 팀별 예약 큐 → `scheduled-posts.ts`에 event_id 연결·`cancelPost`(published 전 취소)·
      markReady가 event 필수필드(일시/장소/정원) + **미치환 플레이스홀더** 검증. 화면 완료
      (`/reservations` 큐 = 상태배지·미완성·치환 결과 표시, `/reservations/new` = 다건 일정 + 회차별
      미리보기 팝업, `/reservations/[id]/edit` = 최종 본문 미리보기).
      스코프(2026-07-31 개정, 07-DECISIONS 64): **보는 것은 운영진 이상 전체**(팀 무관 — 큐는 동아리가
      언제 무엇을 올리는지 한자리에서 보는 화면이다). **고치는 것은 그대로** 소유자(본인·소속 팀) + 회장단.
- [x] ~~일괄 생성 도우미~~ **폐기(2026-07-24)**: 패턴이 고정된 봉사가 드물어 쓰이지 않았다.
      화면(`/reservations/batch`)·API·`batch-generate.ts`·`src/recurrence/` 전부 삭제. 여러 회차는 새 예약
      화면에서 일정 행을 추가해 만든다(회차별 날짜·집합시간·정원 + 회차별 미리보기 팝업).
      recurring_rules 테이블은 데이터 보존을 위해 남겨 둠(미사용 — 03-DATA-MODEL 참고).
- [x] draft-generate 크론 → **미완성 점검** → `src/publishing/readiness-check.ts`(D-3/D-1, notice_check_log
      중복 방지, D-1 격상, 팀장단 알림). `/api/cron/draft-generate` 라우트가 이걸 호출. 구 draft-generation 제거.
- [x] ~~recurring_rules(생성 프리셋) CRUD~~ **삭제(2026-07-24)** — 일괄 생성 전용이라 `recurring-rules.ts`와
      통합 테스트를 함께 제거(화면에서 도달할 수 없는 코드였음).
      DoD(F1 전체): 파일럿 팀이 템플릿→선예약→필드 완성→카페 발행까지 end-to-end (UI 붙이면 완성)
### 1D. 챗봇 v1
> **1D 챗봇 v1 — 코드·테스트 전부 구현·배포(2026-07-24, 커밋 03bd006~24ab22a).** 남은 것은 운영(문서 입력)뿐.
- [x] **(첫 작업) `middleware.ts` nonce 기반 CSP + `unsafe-inline` 제거** → 07-DECISIONS 16. (커밋 03bd006)
- [x] LLM 클라이언트(`src/rag/gemini.ts`): 생성 `gemini-3.1-flash-lite` + 임베딩 `gemini-embedding-2`
      (outputDimensionality=768). 모델 ID env 전용, 구형 배제. function calling(thoughtSignature 처리).
      모델 확정 근거·차원 결정은 07-DECISIONS 14·15. (커밋 ea04125, 24ab22a)
      ※ 프롬프트 캐싱은 미적용 — Gemini 무료/기본 API 는 명시적 캐시 API 가 별도라 v1 범위 밖(아래 잔여).
- [x] documents CRUD + visibility + 소유권 + PII 경고 + 저장 시 재청킹·재임베딩(`src/rag/documents.ts`,
      chunking·pii). API + 관리 UI(`/documents`). (커밋 ea04125, 1a8019c, 6048084)
- [x] 검색(`src/rag/search.ts`, visibility SQL WHERE 강제) + 챗봇 UI(`/chatbot`, 출처·핸드오프·개인정보 고지).
      로그인 전용, 인당 일일 + 전역 분기 쿼터(`src/rag/quota.ts`) + 킬스위치. 상태 tool 2개(`src/rag/tools.ts`).
      마크다운 안전 렌더(`src/lib/markdown.ts`, 원시 HTML 금지). 평가셋 러너(`npm run eval`).
      **DoD 전부 충족·실측 검증**: 부원에 staff/board 문서 미노출(rag-visibility 통합) · 쿼터 차단(quota 통합) ·
      비로그인 401 · 마크다운 파서 경유 · CSP unsafe-inline 없음 · 근거 없으면 핸드오프 · 개인정보 거절 ·
      인젝션 방어 · 정답+출처(chatbot-answer 통합). (커밋 7cc8396, 6048084, 24ab22a)
- [ ] **핵심 문서 5개 입력(운영 작업 — 사용자)**: 회칙, 봉사 FAQ, 회비, 봉사시간 인정, 연락처 안내.
      `/documents` 에서 공개 범위 지정해 입력. 입력 후 `npm run eval` 로 품질 점검.
- [ ] **(잔여) 프롬프트 캐싱** — 도입 트리거: **월 챗봇 호출 3,000건 초과가 2개월 연속**(07-DECISIONS 17).
      그 전엔 절감액 < 월 몇백 원이라 캐시 API 관리 복잡도가 손해. 도달 시 반복 시스템 프롬프트를
      Gemini explicit context cache 로 재사용(캐시 키에 PII·가변 검색결과 제외). 사용량은 /admin/chatbot 확인.

## Phase 2 — 확산 & 고도화 (10월 하순 ~ 11월)
- [ ] 5개 팀 온보딩(반복 규칙 등록은 일괄 생성 폐기로 해당 없음 — 팀장단 온보딩만 남음)
- [x] **챗봇 상태형 질의: 다가오는 봉사 목록(events) tool 연결** — `src/rag/tools.ts` 에 tool 2개
      (`list_upcoming_volunteer_sessions`, `get_volunteer_session_detail`) 구현·연결 완료.
      노출 기준은 "취소 아님 + 장소 정해짐"(07-DECISIONS 24). 잔여 인원 없음(신청은 카페 댓글).
      → 1D 와 함께 이미 만들어졌는데 이 줄만 미체크로 남아 있었다(2026-07-28 대조에서 발견).
- [ ] **F8 총무 모듈(v1 최소)** — ⛔ **무기한 연기(2026-07-28 결정). 요청이 오기 전에는 착수하지 않는다.**
      dues(학기별 회비 — 부원 명단 대비 미납/납부/면제, 금액·계좌 미저장)
      + expenses(지출 대장: 일자/분류(운영비·행사비·기타)/내역/금액/영수증 이미지/메모, 승인 없음).
      **총무·회장단만 접근**(일반 운영진 불가, RLS+서버 검증). 영수증=비공개 Storage, 수정이력 audit.
      스키마는 03 "Phase 2 예정"(확정) → 착수 시 마이그레이션. 자동이체/결제/정산 요청 제외(v2)
      - ❓ **재개 전에 먼저 답해야 하는 것**: `board_position` 은 `president|vice_president|treasurer`
        이고 스키마상 "회장단일 때만" 붙는다. 회장단이 회장·부회장·총무 3인이면 **총무 ⊆ 회장단**이라
        "총무 + 회장단" = 회장단이 되고, `board_position='treasurer'` 검사는 `isPrivileged` 뒤에 가려
        **한 번도 실행되지 않는 코드**가 된다(`isPRTeamOrPrivileged` 가 항상 false 였던 것과 같은 함정).
        의미를 가지려면 `role='staff'` + `board_position='treasurer'` 인 사람이 있어야 한다.
        → 재개 시 **운영 데이터에 그런 행이 있는지 확인하는 것이 첫 단계.**
- [x] **F9 신입 기수 모집(2026-07-25 착수, 2026-07-26 완료)** — 상세 설계 = `docs/09-RECRUIT-DESIGN.md`.
      v1은 지원자 CSV 업로드 → 서류 채점(운영진) → 서류 확정(회장단) → 면접 배정 → 면접 채점 →
      최종 확정 → 결과 공개 → **데이터 폐기**까지 전 과정을 사이트에서 처리.
      ~~지원서 접수 폼은 v2.~~ → **공개 접수 폼도 구현됨**(`/recruit/apply` + `POST /api/recruit/apply`,
      10분 5회 레이트리밋, 이름+전화 중복 409, 마감·폐기 기수 차단). 2026-07-28 현황 점검에서
      "문서는 v2 라는데 코드에는 있다"로 발견해 표기를 고쳤다.
      **채점은 운영진, 결정은 회장단**(운영진은 합격 여부 변경 불가). 결정 #7 번복(전량 저장, 07-DECISIONS 24).
  - [x] **1a 데이터 기반**: 마이그레이션 0013(recruit_cohorts/slots/applicants/scores/memos +
        screen_notes + mapping_presets, 전 테이블 RLS ON, 점수 0~10·0.5단위 CHECK) + 권한 Action
        (recruit.score 운영진 / recruit.manage 회장단) + 03 동기화 + 단위테스트. (커밋 18411ed)
        ⚠ **사용자가 `npm run db:migrate` 로 실 DB 적용 필요**(DIRECT_URL=운영 DB, 에이전트 미실행).
  - [x] **1b 서비스**(순수 로직 + 단위테스트): CSV 파서·매핑·중복감지 / 채점(면접 점수 최초 저장 시
        interview_done 자동 전환, 0개로 감소 시 doc_pass 자동 복귀, `nextStatusOnScoreChange`) /
        개인메모·공용메모지 / 집계(평균·최고/최저·표본부족) / 조회 매칭(이름+전화 정확 일치) / 폐기.
  - [x] **2 API 라우트 + 업로드·매핑 UI**(회장단, 열↔필드 매핑·프리셋·미리보기·중복감지).
  - [x] **3 서류 심사 화면**(운영진, 목록↔우패널·타인 점수 표시·정렬) + 공용 메모지 컴포넌트.
  - [x] **4 서류 집계·확정 + 면접 배정**(회장단, 슬롯 격자·비대면 희망 표시).
  - [x] **5 면접 당일 콘솔**(운영진, 자동 저장·좌우 분할·현재 시간대 강조).
  - [x] **6 최종 결정 + 공개 스위치(2단계 확인) + 데이터 폐기**(회장단, "면접 기록 없음" 경고·noshow).
  - [x] **7 `/recruit` 비로그인 조회**(noindex·독립 레이아웃·이름+전화 정확 일치·IP 분당 5회/실패 10회 차단,
        시도값 미저장) + nav/home 링크 + 07-DECISIONS 24·25 정식화.
  - [x] **모집 종료 후 지원자 데이터 폐기**(회장단, 2단계 확인, 되돌릴 수 없음): 인적사항·자기소개서·메모·
        점수·코멘트 전량 삭제, 익명 집계(지원자 수·합격자 수·평균)만 잔존. ← 파일럿 운영 체크리스트 항목.
  - [x] **QA(2026-07-27)**: 면접 콘솔·최종 결정 화면 코드 리뷰, 자동 상태전이·폐기 가드 실 DB 검증,
        50명 규모 집계·표본 부족 회귀 테스트 추가. 결함 3건 수정 — 면접 점수 기본값 8.0 제거,
        `listApplicantsByIds` 개명, `bulk_status` 기수 범위 필수화(07-DECISIONS 28·29).
        전체: 단위 262건 / 통합 212건 / 빌드 / 타입체크 통과.
  - [x] **CI 가 실제로 검증하게 복구(2026-07-27)**: db/client 지연 초기화로 수집 단계 실패 제거 +
        GitHub Actions 시크릿 등록 → RLS 기본 거부 증명(규칙 #8)이 처음으로 CI 에서 실제 가동.
        그 전까지는 22개 파일 전부 skip = 초록불인데 아무것도 검증하지 않는 상태였다(07-DECISIONS 27).
- [x] **회원 탈퇴(2026-07-28)**: 본인 탈퇴(`/profile` > 동아리 탈퇴, "탈퇴합니다" 입력) +
      회장단 강제 탈퇴(`/admin/members` > 탈퇴 처리, 대상 이름 입력). 비활성화와 달리 되돌릴 수 없고
      이름·이메일·전화가 실제로 지워진다(마이그레이션 0018 `users.withdrawn_at`, 07-DECISIONS 30).
      작성물은 남고 작성자만 '탈퇴한 회원'. 같은 이메일로 재가입 가능. 마지막 권한자는 탈퇴 불가.
- [x] **모집 화면 UX 정비(2026-07-28)**: 단계 내비 역할별 자물쇠 표시(32) / 공고 설정 필드 단위 권한으로
      홍보팀 개방(31 — **2026-07-31 결정 66 으로 번복, 회장단 전용**) / 예약 취소·팀 삭제 확인 추가(33) / 홈 바로가기에 신입모집 추가.
- [x] **작업 B — 사용 안내(2026-07-28)**: 통합 가이드 페이지 대신 **화면별 도움말 팝업 10종**
      (예약 큐·새 예약·템플릿·모집 7단계). 각 화면 제목 옆 "도움말" 버튼 → 그 화면 이야기만 나온다.
      시기별 이야기인 **회장단 체크리스트**만 별도 페이지(`/guides`, requireBoard, 메뉴 "체크리스트").
      원문은 `src/guides/content.ts` 한 곳, `docs/08-USER-GUIDES.md` 는
      `node scripts/build-guides-doc.mjs` 로 생성(화면과 문서 불일치 방지).
      부원에게는 노출하지 않는다(부원용 가이드는 작성했다가 폐기 — 설명이 필요 없다는 판단).
      긴 글 가독성을 위해 `Markdown` 에 `variant="doc"` 추가(챗봇 답변 렌더는 그대로).
- [x] **모집 전 과정 QA 워크스루(2026-07-28)**: 운영진·회장단을 연기해 기수 개설→업로드→서류 채점→
      확정→면접 배정·채점→최종 결정→비로그인 조회→폐기까지 실 DB 로 한 바퀴 + 7화면 실렌더 점검.
      상태머신·권한·중복 차단·자동 전이·폐기는 전부 정상이었고, **화면이 사실과 다르게 말하던 것**
      9건을 고쳤다(07-DECISIONS 34~40). 대표: 서류 심사 목록이 채점해도 늘 '미채점'(없는 필드 `docAvg`),
      최종 결정 화면에서 서류 불합격자가 '진행 중', 배정 누락자에게 경고 없음, 운영진 팀 이관이 무조건 403.
      표시 규칙을 `src/recruit/status-label.ts`·`display.ts` 로 모아 화면별 사슬 중복을 없앴다.
- [x] **면접 당일 운영 도구(2026-07-28)**: 면접 시간표(조마다 표 하나 / 행=시간 범위 / 열=면접관·면접자,
      지난 기수 엑셀과 같은 모양) + **대기실 업무 배정표**(명단 체크·안내·인솔, 마이그레이션 0019)
      + 둘 다 **탭 구분 복사**로 엑셀·카톡에 그대로 붙는다. 면접 콘솔은 슬롯(조)별로 묶고 '지금'을 강조.
      동시 진행 조는 `1조(이찬구)` 처럼 구분한다(07-DECISIONS 41~43).
- [ ] 평가셋 30문항 작성 + 오답률 측정 스크립트 + 주간 기록
- [ ] 지표 대시보드: 발행 성공/실패, 자동 응답률, 핸드오프율, 팀별 사용 현황
- [ ] audit log 조회 화면(회장단), 데이터 CSV export
- [~] **주 1회 자동 백업(2026-07-28 구현)**: `.github/workflows/backup.yml` — 매주 일요일 + 매월 1일
      pg_dump → gzip → GPG(AES256) → **비공개 리포 `animalmate-backups`** 커밋. 보존은 최근 8주 +
      매월 1일자 6개월(순수 함수 + 단위 테스트). 푸시 전에 복호화 검증, 실패 시 공용 Gmail 알림.
      공개 리포 아티팩트를 쓰지 않은 이유는 07-DECISIONS 45.
      복원 스크립트 `scripts/restore-backup.mjs`(기본 dry-run, `--confirm` 없이는 적용 안 함) +
      절차·리허설 단계는 `05-ASSET-REGISTRY.md` "백업·복원".
      → **첫 실행 성공(2026-07-28)**: 601,809 bytes, 커밋 `c2a7344`, AES-256 암호화 확인.
      **남음(DoD)**: 로컬 복원 리허설 1회 — 백업은 복원해 본 적이 있을 때만 백업이다.
- [x] **개인정보처리방침 페이지 + 가입 동의 체크(2026-07-28)**: `/privacy`(비로그인 공개) 신설.
      수집 항목을 부원/지원자로 나눠 실제 스키마 기준으로 명시, 이용 목적·보관 기간·파기(모집 종료 시
      기수 단위 완전 삭제)·처리 위탁(Supabase·Vercel·Google·GitHub) 기재. 원문은 `src/legal/privacy.ts`
      한 곳. 가입 화면과 지원서에 동의 체크박스 + 링크를 붙이고 **서버에서도 동의를 재검사**한다
      (규칙 #6). 문의 주소는 `CONTACT_EMAIL` env — 미설정이면 주소를 지어내지 않는다. 07-DECISIONS 48.
- [~] 챗봇 인젝션 방어 점검 + 레이트 리밋 + 입력창 PII 고지/서버 거절 이중 동작
      → **2026-07-31 QA 로 점검 완료**(07-DECISIONS 75).
      · 인젝션: 시스템 지시와 사용자 데이터 분리 + 규칙 5(자료·질문 속 지시문 불복) +
        **근거 없으면 강제 핸드오프**. 무엇보다 visibility 를 **SQL WHERE 로** 거르므로
        인젝션이 성공해도 질문자가 못 보는 문서로는 넘어갈 수 없다(경계가 모델 앞에 있다).
      · 레이트 리밋: 쿼터가 그 역할(인당 일 30 + 전역 분기 6000, 현재 18/6000).
      · tool: 이벤트 필드만 노출(PII 없음), 날짜 정규식 검증, limit 상한 20, 미지의 tool 은 에러 객체.
      · **서버 PII 거절은 없어서 새로 넣었다** — 입력창 안내만 있고 짝이 비어 있었다.
        주민등록번호·카드·계좌만 질문 단계에서 차단(전화·이메일은 대화에 정상적으로 나와 통과).
      **남음**: 프롬프트 캐싱 적중률·비용 점검은 도입 트리거(월 3,000건 2개월 연속) 전까지 해당 없음.

## Phase 3 — 학기 전환 & 인수인계 (12월 ~ 겨울방학)
- [ ] 학기 전환 기능: 유임 체크 → 일괄 만료 → 새 학기 가입코드 발급 → audit 묶음 기록
- [x] **임기 자동 만료 크론 구현(2026-07-28)** — `src/auth/term-expiry.ts`. 일일 크론이
      `term_end < 오늘(KST)` 인 active 멤버십을 expired 로 바꾸고 `session_version` 을 올려
      세션을 끊는다. 사람 단위 audit(`membership.expire [high]`) + 요약 audit.
      마지막 날은 유효(`term_end === 오늘` 은 만료 아님). 단위 7건 + 실 DB 통합(트랜잭션 롤백).
      → **문서 3곳이 "크론이 매일 강등한다"고 적고 있었지만 코드는 없었다**(07-DECISIONS 47).
- [ ] 임기 자동 만료 **실전 검증**(실제 임기 경과 계정이 생겼을 때 크론 로그·audit 확인)
- [ ] 실제 운영진 교체에 투입 (겨울 교체 시점)
      DoD: 신규 회장단이 개발자 도움 없이 운영진 30명 교체 완료
- [ ] 인수인계 문서: 자산 대장 최종본 + 장애 대응 가이드(토큰 만료, 발행 실패, 한도 초과)
- [ ] 지표 스냅샷·데모 영상·아키텍처 문서 아카이브 (포트폴리오용)

## v2 백로그 (착수 금지, 아이디어만 축적)
- 출석 체크 및 봉사시간 집계 / 후기 수집→카페 자동 게시 / 회계·정산(사람 승인 전제)
- 카카오 알림 채널 검토 / 문서 버전 비교 / 발행 승인 플로우(게시판별 옵션)
- **[피벗으로 제거된 F2 일감 — 재도입 시 여기서]**: 시스템 내 봉사 신청 폼 + 실시간 현황판 +
  자동 마감(정원/시각) + 확정 처리(선착순/선발) + 확정자 전용 오픈채팅 링크·참여코드 배포.
  (현재 방침: 신청=카페 댓글, 수합·확정·카톡=팀장단 수동)

## 결정 기록 (스코프 피벗 판단지점 8개 — 2026-07-23 회장단 확정)
1. **event_status**: `draft → published → done | canceled` 4단계로 단순화(마이그레이션 0002 적용).
2. **가입코드**: `join_codes`(code, semester_label, is_active, created_by, created_at) 단일 활성 코드.
   활성 항상 1개, 재발급=기존 비활성화+신규+audit, 이력 보존. invites 대체.
3. **챗봇 쿼터**: 인당 일 30회 + 전역 분기 상한(분기 예산 1만원 ÷ 모델 단가로 환산). 상수 아닌
   설정 테이블 값(회장단 콘솔 수정). 도달 시 챗봇만 비활성 + 안내 문구 + 회장단 메일 알림.
4. **F8 접근 주체**: 총무 + 회장단만. 일반 운영진·부원 불가(권한표 반영).
5. **F8 dues**: 학기 단위. semester_label 기준 부원 명단 스냅샷 + 상태(미납/납부/면제) + 확인일 + 메모.
   금액·계좌 정보 저장 안 함.
6. **F8 expenses**: 일자/분류(운영비·행사비·기타)/내역/금액/영수증 이미지(Storage)/작성자/메모.
   수정 이력 audit. 승인 플로우 없음(기록 대장).
7. **F9 매칭·상태**: 상태 5단계(접수→서류합격→면접예정→최종합격|불합격). 매칭 키=이름+전화번호
   전체의 해시 저장(원문 미저장), 조회 시 이름+전화번호 전체 입력 대조(뒤 4자리 방식 폐기).
8. **F9 조회 보호**: 실패 메시지 단일화, IP당 분당 5회, 실패 10회 시 1시간 차단, 시도 로그 기록.
   → **2026-07-31 개정(사용자 결정, 07-DECISIONS 80): 실패 카운터의 기준을 IP → 조회 대상(이름)** 으로.
   발표 직후 한 공인 IP 뒤에 수십 명이 몰리면 **남의 오타 열 번에 내가 1시간 잠기기** 때문이다.
   대상 단위로 세면 그 충돌이 없어지고, IP 를 바꿔 가며 한 사람을 노리는 시도까지 한 통에 모여
   **방어는 오히려 세진다.** 이름은 원문이 아니라 HMAC 으로 넣어 "시도 입력값 미저장"(결정 25)을 지킨다.
   총량 상한(IP당 분당 5회)은 그대로다.

> 보안 QA(2026-07-24)에서 나온 결정 9~13(계정 열거 차단 / CSP nonce 시점 / 세션 무효화 /
> 회장단 안전장치 / 강등·비활성화 시 세션 종료)은 **`07-DECISIONS.md`** 로 옮겼다.

## 질문 (에이전트가 스펙 불명확 시 여기에 기록)
### F9 신입 모집 — 구현 중 확인 필요(2026-07-25)
1. **near_station 채우기**: 이번 기수 구글폼이 전체 주소를 받았다. 저장은 "가장 가까운 역 명"만 하기로 확정
   (사용자 지시). CSV 업로드 시 주소 열을 자동으로 역명으로 축약할 수는 없다 → **제안**: 미리보기에서
   전체 주소로 보이는 값에 경고 배지 + 업로드 후 심사 화면에서 인라인으로 역명만 남기도록 안내(사람이 정리).
   대안: 업로드 시 주소 열은 아예 저장하지 않고 near_station 을 나중에 수동 입력. → **1b/2 착수 시 확정**.
2. **조회 시도 로그**: 결정 #8은 "시도 로그 기록"이었으나, 매칭 실패 입력(이름·전화)은 곧 임의의 개인정보라
   저장하면 비지원자 PII 를 수집하게 된다 → **rate_limits 카운터로만 막고 입력값은 저장하지 않기로**(설계 확정).
   07-DECISIONS 25 로 정식화 예정. 이견 있으면 여기에.

### F1 수동 선예약 재개정(2026-07-23) 판단 지점 — 확정·구현 완료
1. **연결 방향**: `scheduled_posts.event_id`(post→event 다대일)로 통일, `events.scheduled_post_id` 제거(0004).
   봉사 공지 예약 = event+post 동시 생성. event 없는 일반 공지(event_id=null)도 같은 큐 사용.
2. **패턴=봉사 날짜(event_date)**. publish_at = 봉사일 − notice_lead_days(기본 7) + publish_time(기본 20:00, KST).
   산출 publish_at 이 이미 지났으면 그 회차 skip(결과에 표시).
3. **owner_type에 global 신설**(0004). global 편집=회장단만, 사용=전원. 팀/개인 템플릿은 소유권 규칙.
4. **recurring_rules**: template_md → template_id(post_templates 참조), draft_lead_days 제거,
   notice_lead_days(7)·publish_time(20:00) 추가(0004/0005). 실체=생성 프리셋(테이블명은 유지 — 리네임 회피).
5. **미완성 점검**: publish_at − 3일 고정. 중복 방지 = notice_check_log(post_id+알림일 유니크). D-1 격상 알림
   ("내일 발행 보류 예정"). 발행 시각 미완성이면 status≠scheduled 라 자동 보류.
