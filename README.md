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

## 인증 준비 (Phase 1 — 대기 중, 사람 몫)
매직링크/초대 메일은 **Supabase Auth 커스텀 SMTP(Resend)** 로 보낸다. 기본 SMTP 는 시간당
수 건 한도라 300명 운영 불가(02-TECH-STACK §3-4). 아래는 코드 붙이기 전에 콘솔에서 해둘 준비다.

### 1) 필요한 값
- `RESEND_API_KEY` — Resend 대시보드에서 발급 → `.env` + 금고.
- `NEXT_PUBLIC_APP_URL` — 서비스 주소(로컬 `http://localhost:3000`).
- Resend 에서 **인증된 발신 도메인/발신자 이메일**(예: `noreply@animalmate.<도메인>`).
  도메인 없으면 초기엔 Resend 테스트 발신자로 시작 가능(수신 제한 있음).

### 2) Resend
1. 가입 → (가능하면) 도메인 추가 후 DNS(SPF/DKIM) 인증 → API 키 발급.

### 3) Supabase 콘솔
1. **Authentication > Emails > SMTP Settings > Enable Custom SMTP**:
   - Host `smtp.resend.com` / Port `465`(SSL) 또는 `587`
   - Username `resend` / Password = `RESEND_API_KEY`
   - Sender = 인증된 발신자 이메일·이름
2. **Authentication > URL Configuration**: Site URL = `NEXT_PUBLIC_APP_URL`,
   Redirect URLs 에 로컬/운영 콜백 등록.
3. (선택) 매직링크·초대 이메일 템플릿 한국어화.

### 준비되면
위가 끝나 `RESEND_API_KEY` 등 값이 채워지면 신호를 주세요 — 매직링크 로그인 + 초대 토큰
가입 플로우(초대받지 않은 이메일 가입 불가) 구현으로 이어갑니다.
