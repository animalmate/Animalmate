# Animalmate

300명 규모 대학생 봉사 동아리 운영 자동화 웹서비스. 기획·규칙은 [`docs/`](docs) 참고
(읽는 순서: `CLAUDE.md` → 01-PRD → 02-TECH-STACK → 03-DATA-MODEL → 04-TODO).

## 스택
Next.js 15(App Router) · TypeScript(strict) · Drizzle ORM · Supabase(Postgres/pgvector/Auth) · Vitest.

## 개발 준비
```bash
npm install
cp env.example .env   # 값 채우기(아래). .env 는 커밋 금지(.gitignore).
```

### 환경 변수
`env.example` 참고. 핵심:
- `DATABASE_URL` — 런타임 쿼리용 **트랜잭션 풀러(6543, pgbouncer)**. 서버 전용.
- `DIRECT_URL` — 마이그레이션(DDL)용 **세션 풀러(5432)**. 서버 전용.
- `SUPABASE_URL` / `SUPABASE_ANON_KEY`(publishable) / `SUPABASE_SERVICE_ROLE_KEY`(secret).
- 비밀번호에 특수문자가 있으면 URL 인코딩(예: `!` → `%21`).

## 데이터베이스 (Drizzle)
```bash
npm run db:generate   # src/db/schema.ts → drizzle/*.sql 마이그레이션 생성
npm run db:migrate    # DIRECT_URL(5432) 로 마이그레이션 적용
```
스키마 변경 시 `docs/03-DATA-MODEL.md` 를 같은 커밋에서 갱신할 것.

## 테스트
```bash
npm run typecheck     # tsc --noEmit
npm test              # 순수 로직 단위 테스트(src/**/*.test.ts)
npm run test:rls      # RLS 기본 거부 증명(실제 Supabase 대상 — 아래 참고)
```

### RLS 보안 테스트 (규칙 #8: 기본 거부)
`test/rls.security.test.ts` 는 **anon key 로 모든 public 테이블에 접근이 거부됨**을 증명한다.
검사 대상 테이블을 하드코딩하지 않고 `pg_tables` 에서 런타임에 수집하므로, **새 테이블이
추가되면 자동으로 검사 대상이 되고 RLS 를 깜빡하면 즉시 실패**한다(누락을 구조적으로 차단).
각 테이블마다 ① `rowsecurity=true` ② anon SELECT 0행 ③ anon INSERT 거부를 확인.

실행에 필요한 env: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DIRECT_URL`(또는 `DATABASE_URL`).
env 가 없으면 건너뛴다(로컬 무설정). **CI 는 반드시 시크릿을 주입해 상시 실행**한다.

## CI
`.github/workflows/ci.yml` 이 push/PR 마다 타입체크 → 단위 테스트 → RLS 테스트를 실행한다.
GitHub 리포 **Settings > Secrets and variables > Actions** 에 아래 시크릿을 등록해야 RLS 테스트가 돈다:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `DIRECT_URL`

## 스케줄러 (pg_cron → /api/cron/*)
Vercel Cron 금지(규칙 #7). Supabase pg_cron + pg_net 으로 API 를 호출한다.
확장은 Dashboard > Database > Extensions 에서 **pg_cron, pg_net** 활성화(완료됨).
앱 배포(Vercel) 후 Supabase SQL 에디터에서 아래 2개 잡을 등록(플레이스홀더 `<APP_URL>`·`<CRON_SECRET>` 교체):
```sql
-- 발행 워커: 매분. due 예약 글을 카페에 게시.
select cron.schedule('publish-worker', '* * * * *', $$
  select net.http_post(
    url := 'https://<APP_URL>/api/cron/publish',
    headers := jsonb_build_object('Authorization','Bearer <CRON_SECRET>','Content-Type','application/json'),
    body := '{}'::jsonb
  );
$$);

-- 회차 초안 생성: 매일 09:00(pg_cron 은 UTC 기준 → KST 09:00 = UTC 00:00).
select cron.schedule('draft-generate', '0 0 * * *', $$
  select net.http_post(
    url := 'https://<APP_URL>/api/cron/draft-generate',
    headers := jsonb_build_object('Authorization','Bearer <CRON_SECRET>','Content-Type','application/json'),
    body := '{}'::jsonb
  );
$$);
```
- `CRON_SECRET` 은 앱 환경변수와 **동일**해야 한다(불일치 시 401).
- 실제 카페 게시는 앱 환경변수 `NAVER_PUBLISH_DRY_RUN=false` 일 때만. 기본은 dry-run(게시 안 함).
- 각 워커는 처리 요약을 JSON 으로 반환하고 audit_logs(`cron.publish` / `cron.draft_generate`)에 남긴다 — 크론 관제 로그.
- 잡 확인: `select * from cron.job;` / 실행 이력: `select * from cron.job_run_details order by start_time desc limit 20;`

## Vercel 배포 체크리스트
Vercel Hobby 는 org private 리포 배포 불가 → 리포를 **public** 으로 전환해 배포(시크릿은 전부 `.env`/
Vercel 환경변수에만 있고 리포엔 없음 — 스크럽 완료). 배포 순서:
1. GitHub 리포 public 전환(사전 시크릿 스크럽 통과).
2. Vercel 에서 리포 Import → Framework: Next.js(자동 감지).
3. **환경변수 등록**(Project Settings > Environment Variables, 서버 전용은 Production/Preview 에):
   - `DATABASE_URL`(6543 트랜잭션 풀러) / `DIRECT_URL`(5432 세션 풀러)
   - `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_API_KEY` / `GEMINI_MODEL` / `GEMINI_EMBEDDING_MODEL`(챗봇 착수 시)
   - `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` / `NAVER_CAFE_CLUB_ID`
   - `TOKEN_ENCRYPTION_KEY`(naver_tokens 복호화 — 부트스트랩과 동일 값)
   - `CRON_SECRET`(pg_cron SQL 과 동일 값)
   - `NAVER_PUBLISH_DRY_RUN=true`(실게시 준비 전까지 유지)
   - `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`(Gmail, 메일 착수 시)
   - `NEXT_PUBLIC_APP_URL`(1차 배포 후 실제 도메인으로 갱신 → 재배포)
   - **제외**: `NAVER_REFRESH_TOKEN`(DB naver_tokens 로 이관 완료, 앱은 env 로 안 읽음)
4. 배포 성공 후 `https://<도메인>/api/health` 가 `{ok:true,db:"up"}` 인지 확인.
5. `NEXT_PUBLIC_APP_URL` 을 실제 도메인으로 갱신하고 재배포 → 위 pg_cron SQL 의 `<APP_URL>` 도 그 도메인으로.
6. UptimeRobot 5분 모니터를 `/api/health` 에 등록(무료 티어 일시정지 방지, 규칙 #9).

## 이메일(Gmail SMTP) 준비 — 대기 중, 사람 몫
인증 메일(이메일 코드)·앱 알림은 **공용 Gmail SMTP** 로 보낸다(앱 비밀번호). 기본 Supabase SMTP 는
한도가 낮아 운영 불가(02-TECH-STACK §3-4). 코드는 이미 SMTP_* env 를 읽도록 준비하며, 실메일
발송 테스트만 아래 준비 후 가능하다. Gmail 무료 발송 한도 ~500통/일.

### 1) 필요한 값
- 공용 Gmail 계정 + **2단계 인증** 켜기 → **앱 비밀번호**(16자리) 발급.
- `.env`(+ Vercel): `SMTP_HOST=smtp.gmail.com` / `SMTP_PORT=587` / `SMTP_USER=<공용Gmail>` /
  `SMTP_PASS=<앱 비밀번호>` / `SMTP_FROM=애니멀메이트 <공용Gmail>`.
- `NEXT_PUBLIC_APP_URL` — 서비스 주소(로컬 `http://localhost:3000`).

### 2) Supabase 콘솔 (Auth 메일도 Gmail 로)
1. **Authentication > Emails > SMTP Settings > Enable Custom SMTP**:
   - Host `smtp.gmail.com` / Port `587`(STARTTLS)
   - Username = 공용 Gmail / Password = 앱 비밀번호
   - Sender = 공용 Gmail 주소·이름
2. **Authentication > URL Configuration**: Site URL = `NEXT_PUBLIC_APP_URL`, Redirect URLs 등록.
3. (선택) 인증·가입 안내 이메일 템플릿 한국어화.

### 준비되면
SMTP_* 값이 채워지면 신호를 주세요 — 앱 알림(팀장단 초안/발행 실패)과 인증(학기 가입코드 +
이메일 코드) 실발송 테스트로 이어갑니다. (인증 코드는 SMTP 신호 전에도 구현·단위 테스트까지 완료.)
