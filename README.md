# Animalmate

대학생 봉사 동아리의 운영을 자동화하는 웹 서비스. 네이버 카페(콘텐츠 아카이브)는 그대로 두고,
그 위에 **정기 봉사 공지 발행 자동화**와 **RAG 챗봇**, **운영진 권한 관리**를 얹는다.

> 상태: **Phase 1 전부 구현·배포 완료** — 반복 공지 발행 루프, 권한/보안, 인증, 운영 화면,
> **실카페 발행 전환**(봇 카페스탭 임명 + `NAVER_PUBLISH_DRY_RUN=false`), **RAG 챗봇**까지 라이브.
> **Phase 2 F9 신입 모집 구현·QA 완료**(2026-07-25 착수 → 07-27 QA → 07-28 전 과정 워크스루) —
> CSV 업로드부터 서류 채점·면접 배정·면접 콘솔·최종 결정·비로그인 결과 조회·데이터 폐기까지 전 과정 동작
> ([`docs/09-RECRUIT-DESIGN.md`](docs/09-RECRUIT-DESIGN.md)).
> 면접 당일 운영에 필요한 **면접 시간표·대기실 업무 배정표**(엑셀 붙여넣기용 복사 포함)까지 붙었다.
> **2026-07-28**: 주 1회 자동 백업, 개인정보처리방침(`/privacy`)과 동의 절차, 멤버십 자동 만료 크론 추가.
> **2026-07-31**: **실사용 개시.** 개시 전후 QA 로 가입 차단·권한 우회 등 결함을 잡았고
> ([`docs/07-DECISIONS.md`](docs/07-DECISIONS.md) 62~83), 인수인계 점검에서
> **장애 대응 가이드**([`docs/11-INCIDENT-RESPONSE.md`](docs/11-INCIDENT-RESPONSE.md))를 새로 썼다.
> 멤버십 만료 기준을 임기 → **1년 미접속**으로 바꿨다(연장할 화면이 없어 전원이 동시에 강등될 상태였다).
> 남은 것 = 운영 작업(**챗봇 안내 문서 입력** — 현재 2건뿐이라 답할 재료가 부족하다),
> **인프라 계정 소유 이전**(겨울), Phase 2 잔여(총무 F8, 평가셋·지표 대시보드).
> 현재 상태 전체는 [`docs/10-STATUS.md`](docs/10-STATUS.md).

## 무엇을 / 왜

- **정기 공지 자동화**(수동 선예약 중심): 팀장단이 템플릿을 불러와 여러 회차를 한 화면에서 선예약
  (회차별 완성본 미리보기) → 필드 완성 → 예약 시각에 봇 계정이 카페 글쓰기 API로 자동 발행.
  회차마다 달라지는 값은 플레이스홀더로 두고 **게시 직전에 치환**하며, 값이 비면 발행을 보류한다.
  발행 D-3에 필수 필드가 비면 크론이 팀장단에게 점검 알림.
- **RAG 챗봇**(로그인 전용, 전원): 회장단이 올린 안내 문서(마크다운)를 임베딩·검색해 답한다.
  **역할별 공개범위(visibility) 필터를 검색 SQL에서 강제**(부원에게 운영진 문서 미노출), 근거가
  없으면 지어내지 않고 운영진 핸드오프, 개인정보 질의 거절, 프롬프트 인젝션 방어(시스템 지시와
  사용자 데이터 분리). 봉사 일정 같은 상태 질의는 events 기반 tool로 답한다. 인당 일일 + 전역
  분기 사용량 상한(회장단 콘솔 조정)과 킬스위치. LLM 응답은 안전한 마크다운 렌더러로만 표시(원시
  HTML 금지). 답변은 마스코트 강아지가 반응한다.
- **운영진 관리**: 학기별 가입코드 가입(전화번호 입력, 본인 수정 가능), 소유권/역할 기반 권한,
  회원 관리 화면에서 역할·소속 팀·직함 배정(봉사 공지 `{{팀장단}}` 자동 구성), **1년 미접속 시 멤버십 자동 만료**, 전 관리행위 감사 로그.

**하지 않는 것**: 카페 글 읽기/수정/댓글 자동화(API·약관), 봉사 신청 수합 자동화(신청은 카페 댓글 유지),
카톡방 생성/자동화, 결제/자동이체. 자세한 범위는 [`docs/01-PRD.md`](docs/01-PRD.md).

## 아키텍처 요약

| 영역 | 선택 |
|---|---|
| 프레임워크 | Next.js 15 (App Router) · TypeScript(strict) |
| DB/인증기반 | Supabase (Postgres · pgvector · Storage) |
| ORM/마이그레이션 | Drizzle |
| 스케줄러 | Supabase **pg_cron + pg_net** → `/api/cron/*` (Vercel Cron 미사용) |
| 이메일 | Gmail SMTP (공용 계정) |
| 호스팅 | Vercel — **함수 리전 `icn1`(서울) 고정**(`vercel.json`), DB 와 같은 리전 |
| 테스트 | Vitest (순수 로직 단위 + 실 DB 통합) |

**보안 모델(기본 거부)**:

- **RLS 전면 활성화**(정책 미부여 = 기본 거부). anon key로는 어떤 테이블도 직접 접근 불가.
  데이터 접근은 전부 서버(service role, 서버 환경변수 전용) 경유.
- 모든 쓰기는 서버에서 **인증 → 멤버십 활성 → 역할 → 소유권**을 검증하고 감사 로그를 남긴다.
- 크론 엔드포인트는 `CRON_SECRET`(Authorization 헤더) 없이는 401.
- 네이버 refresh token은 AES-256-GCM으로 암호화해 DB 저장, 세션은 서명된 JWT(httpOnly 쿠키).

```
브라우저 ──(로그인/조회/질문만)──► Next.js @ Vercel ──► Supabase Postgres (RLS 기본 거부)
                                        │                    ├─ pgvector (문서 임베딩·검색)
                                        ├─ 카페 글쓰기 API(봇, 쓰기 전용, 실발행)
                                        └─ Gemini API(임베딩+생성, 서버에서만)
Supabase pg_cron ──pg_net(CRON_SECRET)──► /api/cron/publish(매분), /api/cron/draft-generate(매일)
UptimeRobot ──5분──► /api/health (일시정지 방지 + 감시)
```

## 문서

| 문서 | 내용 |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | 00 · 개발 규칙(절대 금지/필수 원칙) — 먼저 읽기 |
| [`docs/01-PRD.md`](docs/01-PRD.md) | 기획서(배경·목표·기능·핵심 설계 결정) |
| [`docs/02-TECH-STACK.md`](docs/02-TECH-STACK.md) | 기술 스택·아키텍처·무료 티어 대응 |
| [`docs/03-DATA-MODEL.md`](docs/03-DATA-MODEL.md) | 데이터 모델(테이블·enum·접근 규칙) |
| [`docs/04-TODO.md`](docs/04-TODO.md) | 개발 TODO(Phase별 진행 상황) |
| [`docs/05-ASSET-REGISTRY.md`](docs/05-ASSET-REGISTRY.md) | 자산 대장(계정·키 위치·갱신, 값은 미기재) |
| [`design/docs/06-DESIGN.md`](design/docs/06-DESIGN.md) | 디자인 시스템·UI 프리미티브 규칙 |
| [`docs/07-DECISIONS.md`](docs/07-DECISIONS.md) | 보안·아키텍처 결정 기록(왜 그렇게 했는지) |
| [`docs/08-USER-GUIDES.md`](docs/08-USER-GUIDES.md) | 화면 도움말·회장단 체크리스트 (**자동 생성** — 원문은 `src/guides/content.ts`) |
| [`docs/09-RECRUIT-DESIGN.md`](docs/09-RECRUIT-DESIGN.md) | F9 신입 모집 기술 설계·실행 계획 |
| [`docs/10-STATUS.md`](docs/10-STATUS.md) | **현황 스냅샷** — 무엇이 되고 무엇이 안 되는지(외부 조언자용) |
| [`docs/11-INCIDENT-RESPONSE.md`](docs/11-INCIDENT-RESPONSE.md) | **장애 대응** — 증상별 조치. 앞쪽은 회장단용, 뒤쪽은 개발자용 |

## 로컬 실행

요구: Node 18+ (권장 20/22).

```bash
npm install
cp env.example .env      # 값 채우기(아래). .env 는 커밋 금지(.gitignore).

npm run typecheck        # tsc --noEmit
npm test                 # 순수 로직 단위 테스트
npm run dev              # 개발 서버 (http://localhost:3000)
```

### 환경 변수(요약 — 전체는 `env.example`)

- `DATABASE_URL` — 런타임 쿼리용 Postgres(트랜잭션 풀러 6543). 서버 전용.
- `DIRECT_URL` — 마이그레이션(DDL)용 Postgres(세션 풀러 5432). 서버 전용.
- `TEST_DATABASE_URL` — **통합 테스트 전용 DB**(별개의 Supabase 프로젝트, 세션 풀러 5432).
  운영 프로젝트를 넣으면 테스트가 하드 실패한다.
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`.
- `TOKEN_ENCRYPTION_KEY`(토큰 암호화), `CRON_SECRET`(크론 인증), `SESSION_SECRET`(세션/OTP).
- `GEMINI_*`(챗봇), `NAVER_*`(카페 글쓰기), `SMTP_*`(Gmail 발송), `NAVER_PUBLISH_DRY_RUN`.

> 모든 시크릿은 `.env`(로컬)와 Vercel 환경변수에만 둔다. 리포에는 값이 없다.

### 데이터베이스 (Drizzle)

```bash
npm run db:generate      # src/db/schema.ts → drizzle/*.sql 마이그레이션 생성
npm run db:migrate       # DIRECT_URL(5432)로 적용
```

스키마 변경 시 [`docs/03-DATA-MODEL.md`](docs/03-DATA-MODEL.md)를 같은 커밋에서 갱신한다.

> **`drizzle-kit push` 금지.** push는 `schema.ts`에 RLS 선언이 없는 것을 보고 public 전 테이블의
> RLS를 해제한다. 2026-07-27에 실제로 28개 테이블 RLS가 꺼져 anon key로 회원 정보가 조회됐다.
>
> **새 테이블을 만들면 생성된 SQL에 RLS를 손으로 넣는다** — `db:generate`는 이 구문을 만들어
> 주지 않는다. 빠뜨리면 그 테이블만 조용히 뚫린다(규칙 #8).
> ```sql
> ALTER TABLE "새_테이블" ENABLE ROW LEVEL SECURITY;
> ```
> `npm run test:rls:prod`가 `pg_tables`를 훑어 전 테이블을 검사하므로, 빠뜨리면 테스트가 잡아낸다.
>
> **배포 순서는 migrate 먼저, push 나중.** 컬럼을 추가한 코드를 먼저 배포하면 `SELECT *`가
> 없는 컬럼을 찾아 전 화면이 500이 된다(2026-07-28 실제 사고).

### 통합/보안 테스트 (실 DB 필요)

```bash
npm run db:migrate:test  # 테스트 DB 에 스키마 적용(처음 한 번, 그리고 스키마 바뀔 때마다)
npm run test:integration # 통합 테스트 — 대상은 TEST_DATABASE_URL(테스트 전용 프로젝트)
npm run test:rls:prod    # RLS 기본 거부 증명 — 대상은 운영. 비파괴적(읽기 거부 확인만)
```

**통합 테스트는 운영 DB 에 닿지 않는다.** 예전에는 각 테스트 파일이 `DIRECT_URL ?? DATABASE_URL`
을 집었기 때문에, `.env` 가 있는 머신에서 테스트를 돌리면 곧바로 운영 DB 였다. 이 테스트들은 읽기만
하지 않는다 — 회원·지원자·예약 행을 만들고 지운다. 지금은 `test/db-url.ts` 가 `TEST_DATABASE_URL`
하나만 보고, 값이 없거나 **운영 프로젝트를 가리키면 skip 이 아니라 하드 실패**시킨다.

> 운영과 테스트는 **호스트가 같다**(둘 다 `...pooler.supabase.com`, DB 이름도 둘 다 `postgres`).
> 구분되는 것은 사용자명의 프로젝트 ref 뿐이라, 가드도 ref 로 판정한다. 호스트로 비교하는 코드를
> 쓰지 말 것 — 반드시 통과해 버린다.

운영을 대상으로 남은 것은 셋뿐이고, 각각 이유가 있다(`vitest.prod.config.ts`).

| 스크립트 | 파일 | 왜 운영이어야 하는가 |
|---|---|---|
| `test:rls:prod` | `rls.security.test.ts` | 증명할 대상이 **운영의** RLS 다. 테스트 DB 에서 통과해도 2026-07-27 사고를 잡지 못한다 |
| `test:e2e` | `e2e-http.test.ts` | 배포된 앱에 HTTP 로 붙는다. 그 앱이 보는 DB 와 같아야 한다 |
| `eval` | `chatbot-eval.test.ts` | 실제 지식베이스 품질 측정. 빈 DB 면 전부 핸드오프라 측정이 무의미 |

`test/rls.security.test.ts`는 `pg_tables`에서 테이블을 런타임 수집하므로 **새 테이블이 RLS를
빠뜨리면 자동으로 실패**한다.

모집(recruit) 서비스는 db를 인자로 받지 않고 `src/db/client.ts` 싱글턴을 쓰므로 `DATABASE_URL`도
필요하다(CI는 `DIRECT_URL` 값을 그대로 넘긴다). 이 싱글턴은 **지연 초기화(Proxy)** 라 import만으로는
죽지 않는다 — 예전엔 모듈 최상단에서 throw 해서, env 없는 환경이면 `describe.skip` 가드가 무색하게
수집 단계부터 깨졌다(07-DECISIONS 27).

## 스케줄러 · 배포 · 인증

- 스케줄러(pg_cron SQL), Vercel 배포 체크리스트, Gmail SMTP/인증 준비 절차는
  이 README 하단 및 [`docs/02-TECH-STACK.md`](docs/02-TECH-STACK.md), [`docs/04-TODO.md`](docs/04-TODO.md) 참고.

## 성능에서 지켜야 할 것

측정해서 고친 것들이라 되돌리기 쉽다. 각각의 근거는 [`docs/07-DECISIONS.md`](docs/07-DECISIONS.md) 50~53.

- **`vercel.json` 의 `"regions": ["icn1"]` 을 지우지 말 것.** 지우면 함수가 기본 리전(버지니아)으로
  돌아가고, DB(서울)와의 왕복이 **1회당 ~180ms** 로 뛴다. 화면 하나에 왕복이 여러 번이라 그대로 곱해진다.
  확인법: `curl -sD - https://animalmate.vercel.app/api/health | grep -i x-vercel-id` →
  `icn1::icn1::…` 이어야 한다. 뒤쪽이 `iad1` 이면 리전 설정이 안 먹은 것이다.
  (이 파일에 `crons` 를 추가하는 것은 여전히 금지 — 규칙 #7. 용도는 리전 고정뿐이다.)
- **웹폰트를 `globals.css` 로 되돌리지 말 것.** CSS `@import` 는 렌더 차단 요청을 한 줄로 세운다.
  `layout.tsx` 의 `<link rel="preconnect">` + `<link rel="stylesheet">` 조합을 유지한다.
- **인증 조회는 `Promise.all` 로 묶여 있다**(`loadActor`). 순차 await 로 되돌리면 로그인한
  모든 요청에 왕복 2회가 다시 붙는다.
- **이미지는 쓰는 크기로 넣는다.** 로고는 최대 64px 로 보이므로 128×128(10KB)이면 충분하다.
  예전에 314×314 151KB 원본을 모든 페이지에서 받고 있었다.

## 백업

`.github/workflows/backup.yml`이 매주 일요일 + 매월 1일에 DB 전체를 덤프해 암호화한 뒤 **비공개 리포**
`animalmate-backups`에 커밋한다(무료 티어에는 자동 백업이 없다 — 이 잡이 유일한 안전망이다).

**복원 절차와 리허설 단계는 [`docs/05-ASSET-REGISTRY.md`](docs/05-ASSET-REGISTRY.md)의 "백업·복원" 절**에 있다.
복원은 개발자 작업이라 이 README에 절차를 두지 않는다. 확인만 하는 명령은 안전하다(DB를 건드리지 않는다):

```bash
# Git Bash — 키를 감춰 읽어 그 명령에만 넘긴다(셸 기록에 값이 남지 않는다)
read -s -p "키: " K && BACKUP_ENCRYPTION_KEY="$K" node scripts/restore-backup.mjs; unset K
```

최신 백업을 받아 **테이블·행 수만** 출력한다. `--confirm` 없이는 어떤 DB에도 적용하지 않는다.

> 셸마다 제약이 다르다. `gpg`는 **PowerShell PATH에 없고**(Git for Windows 안에만 있다),
> **Git Bash는 Node에 진짜 콘솔을 주지 않아** 스크립트가 키를 물어봐도 입력을 못 받는다.
> 셸별 명령은 [`docs/05-ASSET-REGISTRY.md`](docs/05-ASSET-REGISTRY.md) "백업·복원" 1단계 참고.

## CI

`.github/workflows/ci.yml`이 push/PR마다 타입체크 → 린트 → 단위 테스트 → RLS 테스트를 실행한다.
RLS 테스트는 GitHub 리포 Settings > Secrets and variables > Actions의 `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `DIRECT_URL`(**Repository secret**으로 등록 — Environment secret은
워크플로에 `environment:` 선언이 없어 안 읽힌다)을 쓴다. 2026-07-27 등록 완료.

> **초록불이 곧 검증은 아니다** — 그래서 조용한 skip 을 막아 뒀다(2026-07-29, 07-DECISIONS 57).
> 예전에는 시크릿 이름이 한 글자만 틀려도 실패가 아니라 `describe.skip` 이 되어, 아무것도 검증하지
> 않은 채 CI 가 통과했다. 지금은 `test/db-url.ts`·`gemini-env.ts`·`rls-env.ts` 가 **CI 에서는
> 하드 실패**한다(로컬만 skip 허용). 의심되면 소요시간이 아니라 **테스트 개수**로 판별한다.

## 라이선스

비영리 동아리 내부 운영용. 별도 명시 전까지 All rights reserved.

---

## 운영 참고 (스케줄러 / 배포)

### 스케줄러 (pg_cron → /api/cron/*)

Vercel Cron 금지. Supabase pg_cron + pg_net으로 호출한다. 확장은 Dashboard > Database >
Extensions에서 pg_cron, pg_net 활성화. 앱 배포 후 SQL 에디터에서(플레이스홀더 교체):

```sql
select cron.schedule('publish-worker', '* * * * *', $$
  select net.http_post(
    url := 'https://<APP_URL>/api/cron/publish',
    headers := jsonb_build_object('Authorization','Bearer <CRON_SECRET>','Content-Type','application/json'),
    body := '{}'::jsonb
  );
$$);

-- ⚠ 잡 이름 `draft-generate`는 옛 "회차 자동 생성"에서 온 것으로 **지금 하는 일과 다르다.**
--    잡을 다시 등록하지 않으려고 이름만 유지한다. 실제 동작 = 일일 유지보수 3가지:
--      ① 발행 D-3/D-1 미완성 점검 + 팀장단 알림
--      ② 1년 넘게 안 들어온 계정의 멤버십 강등 + 세션 무효화 (CLAUDE.md 필수원칙 #2)
--      ③ 지난 레이트 리밋 카운터 정리
select cron.schedule('draft-generate', '0 0 * * *', $$  -- UTC 00:00 = KST 09:00
  select net.http_post(
    url := 'https://<APP_URL>/api/cron/draft-generate',
    headers := jsonb_build_object('Authorization','Bearer <CRON_SECRET>','Content-Type','application/json'),
    body := '{}'::jsonb
  );
$$);
```

- `CRON_SECRET`은 앱 환경변수와 동일해야 한다(불일치 시 401).
- 실제 카페 게시는 `NAVER_PUBLISH_DRY_RUN=false`일 때만. 기본은 dry-run.
- 각 워커는 처리 요약을 JSON으로 반환하고 `audit_logs`에 남긴다(관제 로그).

### Vercel 배포 체크리스트

1. GitHub 리포 public 전환(시크릿 스크럽 통과 상태).
2. Vercel에서 Import → Next.js 자동 감지.
3. 환경변수 등록: `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_*`, `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET`/
   `NAVER_CAFE_CLUB_ID`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, `SESSION_SECRET`, `SMTP_*`,
   `GEMINI_API_KEY`/`GEMINI_MODEL`/`GEMINI_EMBEDDING_MODEL`, `NEXT_PUBLIC_APP_URL`,
   `NAVER_PUBLISH_DRY_RUN`.
   - **`GEMINI_MODEL`/`GEMINI_EMBEDDING_MODEL` 3개 다 필수** — 하나라도 빠지면 문서 저장·챗봇이 실패한다
     (값은 `gemini-3.1-flash-lite` / `gemini-embedding-2`, `07-DECISIONS.md` 14·15).
   - **실카페 발행 전환됨**: Production `NAVER_PUBLISH_DRY_RUN=false`(실제 게시). 로컬 `.env`는 `true` 유지
     (개발 중 실수 게시 방지). 카페는 삭제 API가 없어 되돌릴 수 없다.
   - **제외**: `NAVER_REFRESH_TOKEN`(DB `naver_tokens`로 이관됨), `BACKUP_ENCRYPTION_KEY`(GitHub Actions 시크릿 전용).
4. 배포 후 `/api/health`가 `{ok:true,db:"up"}`인지 확인.
5. `NEXT_PUBLIC_APP_URL`을 실제 도메인으로 갱신 후 재배포, pg_cron SQL의 `<APP_URL>`도 갱신.
6. UptimeRobot 5분 모니터를 `/api/health`에 등록.

### 인증

- 가입: 이메일 + 학기 가입코드 → 6자리 이메일 OTP → 검증 → 회원 생성.
- 로그인: 이메일 → OTP → 세션(JWT 쿠키). 계정 열거 방지.
- 이메일 발송은 `SMTP_*`(Gmail) 설정 시 실발송, 없으면 dry(발송 생략).
