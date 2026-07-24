# 04. 개발 TODO

> 규칙: 위에서 아래로 진행. 각 항목의 DoD(완료 기준)를 만족해야 체크. Phase 0을 통과하지
> 못하면(폴백 결정 전) Phase 1 코드를 쓰지 않는다. 막히면 맨 아래 "질문" 섹션에 기록.

> **진행 요약(2026-07-24):** Phase 1 인증·F1 발행루프·프론트 UI·**디자인 스킨(design/docs/06-DESIGN)**·
> **팀장단 roster(명단+이메일로 관리 권한 부여, "팀" 개칭)**·배포 인프라(Vercel·pg_cron 2잡·UptimeRobot·헬스)
> 전부 완료·push. 테스트: 단위 76 / 통합 99(+HTTP E2E 5) / typecheck 0 / build ✓.
> **남은 것: 실카페 발행 전환(NAVER_PUBLISH_DRY_RUN=false + 봇 카페스탭 임명), 챗봇(1D).**

## Phase 0 — 외부 검증 & 계정 셋업 (캠프 직후 ~8월 말) [GO/NO-GO 게이트]
- [ ] 동아리 공용 Gmail 생성 (복구 이메일 = 회장 개인 메일)
- [ ] 비밀번호 금고 세팅, 자산 대장 문서 시작 (계정/용도/복구수단/비용/갱신일)
- [ ] GitHub Organization 생성, 리포 이전, 개발자 개인 계정 멤버 등록
- [ ] 네이버 조직(단체) 계정 확보 시도 → 불가 시 일반 공용 계정 + 인증 전화번호 대장 기록
- [ ] 네이버 개발자센터 앱 등록(조직 계정 소유), 봇 계정 OAuth 동의, 앱 멤버 등록
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
      **매니저가 봇 계정을 카페스탭으로 임명** 필요 → 임명 후 실발행 게시판별 봇 쓰기 재검증.
- [x] 전체 게시판 menuid 수집 → 초기 boards 데이터 작성
      → 2026-07-23 19개 게시판 수집, 05-ASSET-REGISTRY 게시판 레지스트리에 기록.
      단, menuid 68(테스트) 외 게시판의 봇 쓰기 가능 여부는 실발행 전 게시판별 확인 필요.
- [ ] GO/NO-GO: API 검증 실패 항목이 있으면 폴백(반자동 복붙 발행) 채택 여부 결정·기록

## Phase 1 — 파일럿: 1개 팀 핵심 루프 (9월 ~ 10월 중순)
### 1A. 기반
- [x] Next.js + Supabase 프로젝트 셋업, 마이그레이션으로 03 스키마 생성
      → 2026-07-23 완료. Next.js 15(App Router)+TS strict, Drizzle+postgres.js.
      `drizzle/0000_*.sql` 적용: 15개 테이블 + pgvector 확장 + **전 테이블 RLS 활성화**(규칙 #8).
      런타임=트랜잭션풀러(6543), 마이그레이션=세션풀러(5432, DIRECT_URL). 검증: 15/15 테이블·RLS·vector OK.
      TODO: doc_chunks.embedding 차원(768)은 GEMINI_EMBEDDING_MODEL 확정(1D) 후 재확인.
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
- [ ] Supabase Auth 커스텀 SMTP를 **Gmail(공용 계정 앱 비밀번호)**로 연결 (기본 메일 한도로는 운영 불가)
      + 앱 알림 발송 모듈(nodemailer, Gmail SMTP): 팀장단 초안 알림·발행 실패 알림·핸드오프. 공용 SMTP_* env.
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
- [~] scheduled_posts 작성 화면(제목/본문/이미지/게시판/발행시각) + 상태머신
      → 2026-07-23 상태머신·서비스 완료: `src/publishing/state-machine.ts`(draft→ready→scheduled→
      published|failed, **code 999=rate_limited→failed 아님·대기 후 재시도**, 단위테스트로 증명) +
      `src/publishing/scheduled-posts.ts`(createDraft/markReady[필수값 검증]/schedule/fetchDuePosts/
      applyPublishResult) + `src/naver/cafe-write.ts`(**dry-run 게이트: 기본 dryRun=true, false 명시 시만 실카페**).
      단위 12 + 통합 6. 남음: 작성 UI(인증/프론트).
- [ ] 발행 워커(pg_cron 매분 → API): due 소량(≤5건) 처리, 건별 30초 간격, code 999는 대기 후 재시도,
      그 외 재시도 2회, 실패 알림 메일. DoD: 예약 3건이 지정 시각 ±2분 내 카페에 게시되고 URL 저장됨
      → 2026-07-23 라우트+워커 완료: `src/app/api/cron/publish/route.ts`(CRON_SECRET 검증→워커→JSON 요약)
      + `src/publishing/publish-worker.ts`(due≤5, 실게시 건별 30초, code 999 대기재시도, **처리 요약을
      응답+audit(cron.publish)에 기록**) + `src/http/cron-auth.ts`(상수시간 비교). 인증 단위 5+워커 통합 2.
      토큰 부트스트랩 완료(naver_tokens에 암호화 저장, .env NAVER_REFRESH_TOKEN 제거). pg_cron 잡 등록됨(jobid3 매분).
      + 발행 실패(재시도 소진) 시 회장단 메일 알림(operators.boardEmails), 사이클 중 취소 예약 크래시 방어.
      **남음(사용자): 실게시는 NAVER_PUBLISH_DRY_RUN=false 전환 + 봇을 실공지 게시판 카페스탭으로 임명.**
### 1C. 반복 공지 발행 (F1 — 2026-07-23 재개정: 수동 선예약 중심. 크론 자동 생성 폐기) — 서비스 구현 완료
> 서비스·로직·API 완료(마이그레이션 0004/0005). UI(프론트)만 남음. next build 통과.
- [x] "매월 N번째 X요일" 날짜 계산 유틸 → `src/recurrence/month-weekday.ts`(단위 12). 일괄 생성이 재사용.
- [x] post_templates CRUD (팀/개인/global) → `src/publishing/post-templates.ts`(template.manage,
      global=회장단만·사용 전원, renderTemplate 플레이스홀더). 단위(render 3)+통합. UI "양식 불러오기"만 남음.
- [x] **장소별 양식 + 발행 직전 치환(2026-07-24, 마이그레이션 0007)**: post_templates 에 기본 장소·정원
      (`default_place/default_capacity`) 추가 → 예약 생성 시 events 초기값으로 복사, 회차별로 다르면 예약
      수정에서 변경. `{{장소}}{{정원}}` 은 본문에 남겨 두고 **발행 직전** events 값으로 치환
      (`src/publishing/final-render.ts`, 순수 치환은 `template-render.ts` — 수정 화면 미리보기와 공용).
      미치환 키가 남으면 완성 처리 차단(markReady) + 워커가 게시 없이 failed 확정(audit `post.blocked`).
      발행 성공 시 최종 본문을 scheduled_posts 에 저장. 단위 9(final-render).
- [~] 직접 선예약 + 팀별 예약 큐 → `scheduled-posts.ts`에 event_id 연결·`cancelPost`(published 전 취소)·
      markReady가 event 필수필드(일시/장소/정원) 검증. **예약 큐 화면(프론트)만 남음**.
- [x] 일괄 생성 도우미 → `src/publishing/batch-generate.ts`(패턴+기간 → 템플릿 렌더 event+post 즉시 생성,
      publish_at=봉사일−lead+발행시각 KST, 지난 회차 skip). 통합 테스트 통과.
- [x] draft-generate 크론 → **미완성 점검** → `src/publishing/readiness-check.ts`(D-3/D-1, notice_check_log
      중복 방지, D-1 격상, 팀장단 알림). `/api/cron/draft-generate` 라우트가 이걸 호출. 구 draft-generation 제거.
- [x] recurring_rules(생성 프리셋) CRUD → `recurring-rules.ts` 새 필드(template_id/notice_lead_days/publish_time).
      DoD(F1 전체): 파일럿 팀이 템플릿→선예약(또는 일괄 생성)→필드 완성→카페 발행까지 end-to-end (UI 붙이면 완성)
### 1D. 챗봇 v1
- [ ] LLM 클라이언트: **Gemini 3.1 Flash-Lite(유료 티어)** 생성 + 최신 임베딩 모델.
      **구형 2.0 계열 모델명 사용 금지**. 모델 ID는 `GEMINI_MODEL`·`GEMINI_EMBEDDING_MODEL`
      환경변수로 읽음(기본값 하드코딩 금지, Phase 1에서 콘솔 확인 후 핀 고정). 프롬프트 캐싱 적용
      (반복 시스템 프롬프트 프리픽스 재사용, 캐시 키에 PII/가변 검색결과 제외)
- [ ] documents CRUD + visibility + 소유권 + PII 경고, 저장 시 재임베딩 파이프라인
- [ ] 검색 API(retrieval = visibility 필터 SQL 강제, 질문자 역할 기준) + 챗봇 UI(출처 표시,
      핸드오프 문구, 입력창 고지는 **'개인정보 입력 금지' 하나만**)
      **로그인 사용자 전용**(비로그인 접근 차단) + 사용자별 일일 쿼터 + 전역 일일 상한(chat_logs 기준)
      DoD: 부원 질문에 staff/board 문서가 검색되지 않음(visibility 필터 테스트로 증명) +
      쿼터 초과 시 차단 + 비로그인 호출 거부
- [ ] 핵심 문서 5개 입력(회칙, 봉사 FAQ, 회비, 봉사시간 인정, 연락처 안내)
      DoD: 운영진 전용 문서 내용이 부원 계정 답변에 등장하지 않음(테스트로 증명)

## Phase 2 — 확산 & 고도화 (10월 하순 ~ 11월)
- [ ] 5개 팀 반복 규칙 등록, 팀장단 온보딩(가이드 1페이지)
- [ ] 챗봇 상태형 질의: 다가오는 봉사 목록(events) tool 연결 (잔여 인원 없음 — 신청은 카페 댓글)
- [ ] **F8 총무 모듈(v1 최소)**: dues(학기별 회비 — 부원 명단 대비 미납/납부/면제, 금액·계좌 미저장)
      + expenses(지출 대장: 일자/분류(운영비·행사비·기타)/내역/금액/영수증 이미지/메모, 승인 없음).
      **총무·회장단만 접근**(일반 운영진 불가, RLS+서버 검증). 영수증=비공개 Storage, 수정이력 audit.
      스키마는 03 "Phase 2 예정"(확정) → 착수 시 마이그레이션. 자동이체/결제/정산 요청 제외(v2)
- [ ] **F9 신입 모집**: 비로그인 정적 안내 페이지(LLM 미사용) + 지원 결과 개별 조회.
      상태 5단계(접수→서류합격→면접예정→최종합격|불합격). 매칭=이름+전화번호 전체 **해시 대조**
      (전화 원문 미저장). 운영진 CSV 업로드, 모집 종료 시 cohort 일괄 삭제. 조회 보호: 실패 메시지
      단일화 + IP 분당 5회 + 실패 10회 시 1시간 차단 + 시도 로그. 신규 테이블도 생성 시 RLS 활성화
- [ ] 평가셋 30문항 작성 + 오답률 측정 스크립트 + 주간 기록
- [ ] 지표 대시보드: 발행 성공/실패, 자동 응답률, 핸드오프율, 팀별 사용 현황
- [ ] audit log 조회 화면(회장단), 데이터 CSV export
- [ ] 주 1회 자동 백업: GitHub Actions pg_dump → 암호화(키는 Actions 시크릿+금고) → 비공개 저장
      DoD: 백업본으로 로컬 복원 리허설 1회 성공 (무료 티어는 자동 백업 없음 — 유일한 안전망)
- [ ] 개인정보처리방침 페이지 + 가입 동의 체크
- [ ] 챗봇 인젝션 방어 점검 + 레이트 리밋 + 프롬프트 캐싱 적중률·비용 점검
      + 입력창 '개인정보 입력 금지' 고지/서버 PII 거절 이중 동작 확인

## Phase 3 — 학기 전환 & 인수인계 (12월 ~ 겨울방학)
- [ ] 학기 전환 기능: 유임 체크 → 일괄 만료 → 새 학기 가입코드 발급 → audit 묶음 기록
- [ ] 임기 자동 만료 크론 실전 검증
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
8. **F9 조회 보호**: 실패 메시지 단일화, IP당 분당 5회, 실패 10회 시 IP 1시간 차단, 시도 로그 기록.

## 질문 (에이전트가 스펙 불명확 시 여기에 기록)
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
