# Animalmate

대학생 봉사 동아리의 운영을 자동화하는 웹 서비스. 네이버 카페(콘텐츠 아카이브)는 그대로 두고,
그 위에 **정기 봉사 공지 발행 자동화**와 **RAG 챗봇**, **운영진 권한 관리**를 얹는다.

> 상태: **Phase 1 전부 구현·배포 완료** — 반복 공지 발행 루프, 권한/보안, 인증, 운영 화면,
> **실카페 발행 전환**(봇 카페스탭 임명 + `NAVER_PUBLISH_DRY_RUN=false`), **RAG 챗봇**까지 라이브.
> **Phase 2 F9 신입 모집 구현·QA 완료**(2026-07-25 착수 → 07-27 QA → 07-28 전 과정 워크스루) —
> CSV 업로드부터 서류 채점·면접 배정·면접 콘솔·최종 결정·비로그인 결과 조회·데이터 폐기까지 전 과정 동작
> ([`docs/09-RECRUIT-DESIGN.md`](docs/09-RECRUIT-DESIGN.md)).
> 면접 당일 운영에 필요한 **면접 시간표·대기실 업무 배정표**(엑셀 붙여넣기용 복사 포함)까지 붙었다.
> 남은 것 = 운영 작업(안내 문서 입력), Phase 2 잔여(총무 F8, 평가셋·지표 대시보드·자동 백업).

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
  회원 관리 화면에서 역할·소속 팀·직함 배정(봉사 공지 `{{팀장단}}` 자동 구성), 임기 자동 만료, 전 관리행위 감사 로그.

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
| 호스팅 | Vercel |
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
| [`docs/09-RECRUIT-DESIGN.md`](docs/09-RECRUIT-DESIGN.md) | F9 신입 모집 기술 설계·실행 계획(진행 중) |

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
> `npm run test:rls`가 `pg_tables`를 훑어 전 테이블을 검사하므로, 빠뜨리면 테스트가 잡아낸다.
>
> **배포 순서는 migrate 먼저, push 나중.** 컬럼을 추가한 코드를 먼저 배포하면 `SELECT *`가
> 없는 컬럼을 찾아 전 화면이 500이 된다(2026-07-28 실제 사고).

### 통합/보안 테스트 (실 DB 필요)

```bash
npm run test:rls         # RLS 기본 거부 증명 + 서비스 통합(실 Supabase 대상)
```

`SUPABASE_URL`/`SUPABASE_ANON_KEY`/`DIRECT_URL`이 없으면 건너뛴다. `test/rls.security.test.ts`는
`pg_tables`에서 테이블을 런타임 수집하므로 **새 테이블이 RLS를 빠뜨리면 자동으로 실패**한다.

모집(recruit) 서비스는 db를 인자로 받지 않고 `src/db/client.ts` 싱글턴을 쓰므로 `DATABASE_URL`도
필요하다(CI는 `DIRECT_URL` 값을 그대로 넘긴다). 이 싱글턴은 **지연 초기화(Proxy)** 라 import만으로는
죽지 않는다 — 예전엔 모듈 최상단에서 throw 해서, env 없는 환경이면 `describe.skip` 가드가 무색하게
수집 단계부터 깨졌다(07-DECISIONS 27).

## 스케줄러 · 배포 · 인증

- 스케줄러(pg_cron SQL), Vercel 배포 체크리스트, Gmail SMTP/인증 준비 절차는
  이 README 하단 및 [`docs/02-TECH-STACK.md`](docs/02-TECH-STACK.md), [`docs/04-TODO.md`](docs/04-TODO.md) 참고.

## CI

`.github/workflows/ci.yml`이 push/PR마다 타입체크 → 단위 테스트 → RLS 테스트를 실행한다.
RLS 테스트는 GitHub 리포 Settings > Secrets and variables > Actions의 `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `DIRECT_URL`(**Repository secret**으로 등록 — Environment secret은
워크플로에 `environment:` 선언이 없어 안 읽힌다)을 쓴다. 2026-07-27 등록 완료.

> **초록불이 곧 검증은 아니다.** 통합 테스트는 env가 없으면 스스로 `describe.skip`으로 건너뛴다.
> 시크릿이 비었거나 **이름이 한 글자라도 틀리면 실패가 아니라 조용한 skip**이 되어, 아무것도
> 검증하지 않은 채 CI가 통과한다. 판별은 **"RLS 보안 테스트" 단계 소요시간**으로 한다 —
> **약 13초 = 전부 skip**, **6~8분 = 실제 실행**(로컬은 ~50초, CI는 서울 리전 왕복 지연으로 느리다).
> 조회: `curl -s https://api.github.com/repos/animalmate/Animalmate/actions/runs/<id>/jobs`
> (리포가 public이라 인증 없이 읽힌다.)

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

-- 미완성 점검: 발행 D-3에 필수 필드 빈 예약 → 팀장단 알림(회차 자동 생성 아님).
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
