# Animalmate

대학생 봉사 동아리의 운영을 자동화하는 웹 서비스. 네이버 카페(콘텐츠 아카이브)는 그대로 두고,
그 위에 **정기 봉사 공지 발행 자동화**와 **RAG 챗봇**, **운영진 권한 관리**를 얹는다.

> 상태: Phase 1 개발 중. 반복 공지 발행 루프·권한/보안·인증(가입코드+이메일 OTP)까지 구현.

## 무엇을 / 왜

- **정기 공지 자동화**(수동 선예약 중심): 팀장단이 템플릿을 불러와 미래 발행을 직접 선예약(또는 반복
  패턴+기간으로 초안 N건 즉시 일괄 생성) → 필드 완성 → 예약 시각에 봇 계정이 카페 글쓰기 API로 자동 발행.
  발행 D-3에 필수 필드가 비면 크론이 팀장단에게 점검 알림.
- **RAG 챗봇**(로그인 전용): 회칙·FAQ 등 문서 기반 응답. 역할별 공개범위(visibility) 필터,
  출처 표시, 모르면 운영진 핸드오프.
- **운영진 관리**: 학기별 가입코드 가입, 소유권/역할 기반 권한, 임기 자동 만료, 전 관리행위 감사 로그.

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
                                        │                    ├─ pgvector (문서 임베딩)
                                        ├─ 카페 글쓰기 API(봇, 쓰기 전용)
                                        └─ LLM API(서버에서만)
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

### 통합/보안 테스트 (실 DB 필요)

```bash
npm run test:rls         # RLS 기본 거부 증명 + 서비스 통합(실 Supabase 대상)
```

`SUPABASE_URL`/`SUPABASE_ANON_KEY`/`DIRECT_URL`이 없으면 건너뛴다. `test/rls.security.test.ts`는
`pg_tables`에서 테이블을 런타임 수집하므로 **새 테이블이 RLS를 빠뜨리면 자동으로 실패**한다.

## 스케줄러 · 배포 · 인증

- 스케줄러(pg_cron SQL), Vercel 배포 체크리스트, Gmail SMTP/인증 준비 절차는
  이 README 하단 및 [`docs/02-TECH-STACK.md`](docs/02-TECH-STACK.md), [`docs/04-TODO.md`](docs/04-TODO.md) 참고.

## CI

`.github/workflows/ci.yml`이 push/PR마다 타입체크 → 단위 테스트 → RLS 테스트를 실행한다.
GitHub 리포 Settings > Secrets and variables > Actions에 `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`DIRECT_URL`을 등록해야 RLS 테스트가 돈다.

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
3. 환경변수 등록: `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_*`, `GEMINI_*`, `NAVER_*`,
   `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, `SESSION_SECRET`, `SMTP_*`,
   `NAVER_PUBLISH_DRY_RUN=true`, `NEXT_PUBLIC_APP_URL`.
   (제외: `NAVER_REFRESH_TOKEN` — DB `naver_tokens`로 이관됨.)
4. 배포 후 `/api/health`가 `{ok:true,db:"up"}`인지 확인.
5. `NEXT_PUBLIC_APP_URL`을 실제 도메인으로 갱신 후 재배포, pg_cron SQL의 `<APP_URL>`도 갱신.
6. UptimeRobot 5분 모니터를 `/api/health`에 등록.

### 인증

- 가입: 이메일 + 학기 가입코드 → 6자리 이메일 OTP → 검증 → 회원 생성.
- 로그인: 이메일 → OTP → 세션(JWT 쿠키). 계정 열거 방지.
- 이메일 발송은 `SMTP_*`(Gmail) 설정 시 실발송, 없으면 dry(발송 생략).
