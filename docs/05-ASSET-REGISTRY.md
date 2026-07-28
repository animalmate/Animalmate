# 05. 자산 대장 (ASSET REGISTRY)

> Phase 0 산출물. 모든 인프라 계정·키·비용·갱신일을 한 곳에서 관리한다.
> **이 문서에 실제 비밀번호/토큰/키 값을 적지 않는다** (00 규칙 #4). 값은 비밀번호 금고에 두고,
> 여기에는 "무엇이 어디에 있는지, 누가 소유하는지, 언제 갱신하는지"만 기록한다.
> 운영진 교체 시 이 문서 + 금고를 인수인계한다 (02-TECH-STACK §7).

## 계정 소유 원칙
- 모든 인프라 계정은 **동아리 공용 Gmail** 소유. 개발자 개인 계정 소유 금지.
- GitHub은 **Organization**, 개발자는 멤버(소유권은 조직).
- 복구 이메일/전화번호는 회장단이 관리, 교체 시 로테이션.

## 계정 목록
| 서비스 | 용도 | 소유 계정 | 2FA | 비밀번호 위치 | 비용 | 갱신일 | 비고 |
|---|---|---|---|---|---|---|---|
| 공용 Gmail | 루트 계정·복구·알림 수신 | (공용) | 필수 | 금고 | 무료 | — | 복구=회장 개인메일 |
| GitHub Org | 소스 리포 | 공용 Gmail | 필수 | 금고 | 무료 | — | 개발자=멤버 |
| Vercel | 호스팅(Hobby) | 공용 Gmail | 권장 | 금고 | 무료 | — | Cron 사용 금지 |
| Supabase | DB/Auth/벡터/스토리지 | 공용 Gmail | 권장 | 금고 | 무료 | — | 7일 미사용 정지 주의 |
| 네이버 개발자센터 | 카페 글쓰기 앱 | 조직/공용 네이버 | 필수 | 금고 | 무료 | — | 앱 소유=조직 계정 |
| 네이버 봇 계정 | 카페 글쓰기 실행 | 공용 네이버 | 필수 | 금고 | 무료 | — | 카페 가입·쓰기권한 필요 |
| LLM 제공사 | 생성+임베딩 | 공용 Gmail | 권장 | 금고 | 선불 크레딧 | 월 | 하드 한도+알림 설정 |
| Gmail SMTP | 이메일 발송(Auth+알림) | 공용 Gmail | 필수 | 금고(앱 비밀번호) | 무료(~500/일) | — | 2FA+앱 비밀번호, Supabase SMTP 연결 |
| GitHub 백업 리포 | DB 백업 보관 | GitHub Org(공용 Gmail) | 필수 | 금고 | 무료 | — | `animalmate-backups` **Private**. 메인 리포는 public 이라 아티팩트로 보관 불가(07-DECISIONS 45) |
| UptimeRobot | keep-alive/감시 | 공용 Gmail | 권장 | 금고 | 무료 | — | 5분 핑 /api/health |
| Sentry | 에러 모니터링 | 공용 Gmail | 권장 | 금고 | 무료 | — | 알림=공용 메일 |
| 도메인 | 서비스 주소 | 공용 Gmail | 권장 | 금고 | 연 ~2만원 | 매년 | 자동갱신 확인 |

> **스코프 피벗(2026-07-23) 자산 영향**: 신규 외부 계정 불필요. F8 총무 영수증은 기존 Supabase
> Storage의 **비공개 버킷**에 저장(공개 금지). ~~F9 신입 지원자 PII(이름+전화번호 전체의 해시, 원문 미저장)~~
> → **개정(2026-07-25, 07-DECISIONS 24)**: 서류·면접 심사를 사이트에서 직접 수행하므로 지원서 항목을
> **원문 저장**한다(주소만 역명으로 축소). 열람=운영진 이상, 결정·내려받기=회장단, 모집 종료 시 기수 단위
> 완전 삭제로 보관을 제한한다. 모집 공고 포스터는 Storage **공개** 버킷 `recruit-notice` 를 쓴다.
> 카톡/오픈채팅 관련 자산 항목 없음(시스템 미관여).

## 시크릿/키 인벤토리 (값 아님 — 위치·로테이션만)
| 키 이름 | 용도 | 저장 위치 | 로테이션 주기 | 비고 |
|---|---|---|---|---|
| SUPABASE_SERVICE_ROLE_KEY | 서버 DB 접근 | Vercel 환경변수 + 금고 | 운영진 교체 시 | 서버 전용 |
| GEMINI_API_KEY | Gemini 생성+임베딩 호출 | Vercel 환경변수 + 금고 | 운영진 교체 시 | 한도 설정 |
| NAVER_CLIENT_ID/SECRET | 카페 앱 | Vercel 환경변수 + 금고 | 운영진 교체 시 | |
| TOKEN_ENCRYPTION_KEY | refresh token 암호화 | Vercel 환경변수 + 금고 | 신중히(재암호화 필요) | |
| CRON_SECRET | pg_cron→API 인증 | Supabase + Vercel + 금고 | 운영진 교체 시 | 양쪽 일치 |
| BACKUP_ENCRYPTION_KEY | 백업 암호화(GPG 대칭) | GitHub Actions 시크릿 + 금고 | 신중히 | **잃으면 모든 백업이 열리지 않는다.** `.env`·Vercel 에 넣지 말 것(앱 런타임 변수 아님) |
| BACKUP_REPO_TOKEN | 백업 리포 push | GitHub Actions 시크릿 + 금고 | **만료일 주의** | fine-grained PAT, 대상 `animalmate-backups` 한정, Contents read/write + Metadata read. 만료되면 백업이 조용히 멈추므로 갱신일을 달력에 |
| DIRECT_URL (Actions) | pg_dump 접속 | GitHub Actions 시크릿 + 금고 | DB 비밀번호 변경 시 | 세션 풀러(5432). 트랜잭션 풀러(6543)로는 pg_dump 불가 |
| SMTP_* (Actions) | 백업 실패 알림 | GitHub Actions 시크릿 + 금고 | 앱 비밀번호 변경 시 | 앱과 같은 값. 선택 `ALERT_TO` 로 수신자 지정 |

## 백업·복원

> **복원은 개발자 작업이다.** 회장단 가이드에 넣지 않는다.
> Supabase 무료 티어에는 자동 백업이 없다 — 아래 잡이 **유일한 안전망**이다.

### 백업이 도는 방식

| 항목 | 값 |
|---|---|
| 워크플로 | `.github/workflows/backup.yml` (이름: 백업) |
| 주기 | 매주 일요일 18:00 UTC(= 월 03:00 KST) + **매월 1일** 18:00 UTC |
| 방식 | `pg_dump` → `gzip` → `gpg` 대칭 암호화(AES256) → 비공개 리포 `animalmate-backups` 의 `dumps/` 에 커밋 |
| 파일명 | `backup-YYYY-MM-DD.sql.gz.gpg` (UTC 날짜) |
| 보존 | 최근 8주 전부 + **매월 1일자는 6개월**. 초과분은 잡이 자동 삭제 |
| 실패 시 | 공용 Gmail 로 알림 메일 |

- 평문 `.sql` 은 **디스크에 닿지 않는다** — 덤프·압축·암호화가 한 파이프라인이다.
- 암호는 명령행 인자가 아니라 파일 디스크립터로 넘긴다(프로세스 목록에 노출 금지).
- 푸시 전에 **복호화가 되는지 확인**한다. 열리지 않는 파일을 6개월 쌓지 않기 위해서다.
- 월간 잡을 따로 둔 이유: 주간 잡만으로는 1일에 걸리는 일이 드물어 월간 보존 규칙이 사실상 죽는다.

### 복원 리허설 (분기 1회 권장 — 백업은 복원해 본 적 있을 때만 백업이다)

준비물: `git`, `gpg`, Node 22+, (5단계까지 갈 때만) 로컬 PostgreSQL 17 + `psql`.

> ⚠ **셸마다 되는 방법이 다르다.** 두 가지 제약이 겹친다.
> - `gpg` 는 **PowerShell PATH 에 없다**(Git for Windows 안에만 있다).
> - **Git Bash 는 Node 에 진짜 콘솔을 주지 않는다** — 스크립트가 키를 물어봐도 입력을 못 받는다.
>
> 그래서 셸에 맞는 명령을 골라 쓴다(아래 1단계).

**1단계 — 최신 백업을 받아 내용만 확인한다 (DB 불필요, 여기까지가 최소 리허설)**

**Git Bash 라면** — `read -s` 로 키를 감춰 읽어 그 명령에만 넘긴다:

```bash
read -s -p "키: " K && BACKUP_ENCRYPTION_KEY="$K" node scripts/restore-backup.mjs; unset K
```

**PowerShell 이라면** — gpg 경로를 먼저 넓히면 스크립트가 직접 물어본다:

```powershell
$env:PATH = "C:\Program Files\Git\usr\bin;$env:PATH"
node scripts/restore-backup.mjs
```

**어느 쪽도 안 되면** — 키를 파일에 두고 넘긴 뒤 그 파일을 지운다:

```bash
node scripts/restore-backup.mjs --key-file ./key.txt && rm key.txt
```

> **키를 명령줄에 그대로 붙여넣지 않는다.** `BACKUP_ENCRYPTION_KEY=실제값 node …` 로 주면 그 값이
> 셸 기록 파일(PowerShell `ConsoleHost_history.txt`, bash `.bash_history`)에 **평문으로 남는다.**
> 백업 전체를 여는 열쇠라 그렇게 두면 안 된다. 위 세 방법은 모두 기록에 값을 남기지 않는다.

이 명령은 백업 리포에서 최신 파일을 받아 복호화하고 **테이블 수와 테이블별 행 수만 출력**한다.
DB 는 전혀 건드리지 않는다. 확인할 것:

- `✔ 복호화 성공` 이 나오는가 (안 나오면 열쇠가 틀렸거나 파일이 깨졌다 — **즉시 조치 대상**)
- `public 테이블` 수가 현재 스키마와 맞는가 (0020 적용 전 29개 / 적용 후 27개)
- `RLS 활성화 구문` 이 테이블 수만큼 있는가 — 0 이면 복원본이 **기본 거부가 아니다**(규칙 #8)
- `users`, `recruit_applicants` 등 실제 데이터가 있어야 할 테이블의 행 수가 0 이 아닌가

> `그 밖의 스키마` 줄에 나오는 `auth`·`storage`·`realtime`·`drizzle` 은 Supabase 시스템 스키마와
> 마이그레이션 기록이다. 우리 앱 테이블이 아니므로 public 개수에 섞지 않는다.

**2단계 — 덤프 원문을 눈으로 본다 (선택)**

```bash
read -s -p "키: " K && BACKUP_ENCRYPTION_KEY="$K" node scripts/restore-backup.mjs --keep ./check.sql; unset K
```

`check.sql` 은 **평문 개인정보**다. 확인이 끝나면 반드시 지운다: `rm check.sql`

**3단계 — 빈 로컬 DB 를 만든다**

```bash
createdb animalmate_restore_test
```

**4단계 — 로컬 DB 에 복원한다**

```bash
read -s -p "키: " K && BACKUP_ENCRYPTION_KEY="$K" node scripts/restore-backup.mjs \
  --to postgresql://postgres@localhost:5432/animalmate_restore_test --confirm; unset K
```

`--confirm` 이 없으면 대상만 확인하고 적용하지 않는다(사고 방지). 대상이 `.env` 의 운영 DB 와
같으면 경고 후 10초 기다린다 — 그때 Ctrl+C 로 멈출 수 있다.

**5단계 — 복원 결과를 검증한다**

```bash
psql postgresql://postgres@localhost:5432/animalmate_restore_test -c \
  "select count(*) as 테이블수 from pg_tables where schemaname='public';"
psql postgresql://postgres@localhost:5432/animalmate_restore_test -c \
  "select relname, n_live_tup from pg_stat_user_tables order by n_live_tup desc limit 10;"
```

테이블 수가 29(현재 스키마 기준)이고 주요 테이블에 행이 있으면 리허설 성공이다.
**RLS 는 덤프에 포함되지 않을 수 있다** — 복원본을 운영으로 승격할 일이 생기면
`npm run db:migrate` 로 마이그레이션을 다시 적용해 RLS 를 확인하고, `npm run test:rls` 로 증명한다.

**6단계 — 뒷정리**

```bash
dropdb animalmate_restore_test
```

리허설 날짜와 결과를 아래 표에 남긴다.

### 진짜 장애가 나서 운영 DB 를 되돌려야 할 때

1. **먼저 멈춘다.** Supabase 에서 pg_cron 잡 2개를 `cron.unschedule` 하거나 Vercel 배포를 잠근다.
   발행 워커가 도는 중에 DB 를 되돌리면 같은 공지가 카페에 다시 나갈 수 있고, 카페는 삭제 API 가 없다.
2. 1단계로 백업 내용을 확인한다(어느 시점 데이터인지).
3. `--to <운영 DIRECT_URL> --confirm` 으로 적용한다. 운영 DB 경고가 뜨고 10초를 기다린다.
4. `/api/health` 가 `{ok:true,db:"up"}` 인지 확인하고, 크론을 다시 켠다.
5. 되돌린 시점 이후의 데이터는 사라진다 — 회장단에게 무엇이 사라졌는지 알린다.

### 실행 기록

| 날짜 | 종류 | 결과 | 비고 |
|---|---|---|---|
| 2026-07-28 | **첫 백업**(수동 실행) | ✅ 성공 | `backup-2026-07-28.sql.gz.gpg` **601,809 bytes**. 커밋 `c2a7344`. 파일 형식 확인: `PGP symmetric key encrypted data - AES with 256-bit key, salted & iterated, SHA512`. 잡 전체 119초(덤프·암호화 72초) |
| 2026-07-28 | **복원 리허설 1단계**(내용 확인) | ✅ 성공 | 금고 키로 복호화 성공. 압축 해제 **5.28 MB**, public 테이블 **29개**(당시 스키마와 일치), Supabase 시스템 스키마 4개 별도. 주요 행 수: `audit_logs` 8,174 / `recruit_applicants` 50 / `users` 10 / `memberships` 8. **백업이 실제로 열리고 내용이 온전함을 확인** |
| ⬜ | 복원 리허설 3~6단계(로컬 DB 적용) | 미실시 | 실제로 넣어 봐야 완전한 리허설이다. **분기 1회 권장** |

> 첫 실행까지 두 번 실패했다. 같은 함정에 다시 빠지지 않도록 남긴다.
> 1. **빈 백업 리포에서 `actions/checkout` 이 죽는다** — 커밋이 없는 리포에는 `refs/heads/main`
>    자체가 없다(`couldn't find remote ref`). 지금은 `git ls-remote` 로 main 존재를 확인한 뒤
>    클론하거나 새로 init 한다.
> 2. **`/usr/bin/pg_dump` 는 pg_wrapper 라 16 을 골라 준다** — 러너에 postgresql-16 서버
>    클러스터가 있어서, client-17 을 설치해도 래퍼가 16 을 쓴다(`server version: 17.6;
>    pg_dump version: 16.14`). 지금은 `/usr/lib/postgresql/17/bin/pg_dump` 절대 경로를 쓰고,
>    없으면 즉시 실패시킨다.

## 네이버 카페 API 검증 기록 (Phase 0 GO/NO-GO)
| 항목 | 결과 | 날짜 | 비고 |
|---|---|---|---|
| refresh token 갱신 | ✅ 검증 | 2026-07-23 | verify 실행 시 refresh→access 갱신 성공 |
| 글쓰기 — 텍스트 | ✅ 검증 | 2026-07-23 | 글 URL: https://cafe.naver.com/animalmate2010/32987 (수동 삭제) |
| 글쓰기 — 이미지 1장 | ✅ 검증 | 2026-07-23 | 글 URL: https://cafe.naver.com/animalmate2010/32988 (수동 삭제) |
| 글쓰기 — 이미지 2장 | ✅ 검증 | 2026-07-23 | 글 URL: https://cafe.naver.com/animalmate2010/32989 (수동 삭제) |
| 일일 호출 한도 | ⬜ 미기록 | | 콘솔 수치: |
| **GO / NO-GO 결정** | ✅ **GO** | 2026-07-23 | 3/3 성공. 테스트 게시판 menuid 68(30기 자기소개). 연속 게시 방지(code 999)는 케이스 간 20초 지연으로 회피 — 실운영 발행 워커도 건별 간격 필요 |

## 게시판 레지스트리 (boards 초기 데이터 원본)
> 카페 전체 게시판의 menuid를 수집해 여기에 정리 → 마이그레이션/시드로 옮긴다.

> menuid 수집: 2026-07-23, 카페 animalmate2010 (clubid 29850342).
> **중요:** menuid 68(30기 자기소개)은 전체 공개 게시판이라 봇 글쓰기 성공. 반면 menuid 12(4팀 봉사공지)는
> `AP003 카페스탭 등급 필요`로 거부됨(2026-07-23 검증). **실제 봉사/공지 게시판은 대부분 카페스탭 전용일
> 가능성이 높음** → 실운영하려면 카페 매니저가 봇 계정을 **카페스탭으로 임명**해야 함(회장단 미팅 안건).
>
> ✅ **2026-07-24 해소: 봇 계정 카페스탭 임명 완료 + Vercel `NAVER_PUBLISH_DRY_RUN=false` 전환.**
> 이제 예약이 실제 카페에 게시된다. 아래 표의 `봇 쓰기` 열은 게시판별 실제 성공 여부로 갱신할 것
> (예약은 `bot_can_write=true` 인 게시판에만 만들 수 있다 — 게시판 게이트, 07-DECISIONS 참고).

| menuid | 게시판 이름 | 용도 | 봇 쓰기(bot_can_write) | 활성 |
|---|---|---|---|---|
| 68 | 30기 자기소개 | **테스트 전용**(실발행 안 함) | ✅ 검증됨 | ✅ |
| 14 | 공지사항 | 전체 공지 | ⬜ 미검증 | ✅ |
| 53 | 동아리 소개 | 소개 | ⬜ 미검증 | ✅ |
| 17 | 동아리 회칙 | 회칙 | ⬜ 미검증 | ✅ |
| 50 | 입양 홍보 게시판 | 입양 홍보 | ⬜ 미검증 | ✅ |
| 9 | 1팀 봉사 공지 | 팀 봉사 공지 | ⬜ 미검증 | ✅ |
| 10 | 2팀 봉사 공지 | 팀 봉사 공지 | ⬜ 미검증 | ✅ |
| 11 | 3팀 봉사 공지 | 팀 봉사 공지 | ⬜ 미검증 | ✅ |
| 12 | 4팀 봉사 공지 | 팀 봉사 공지 | ❌ 스탭 등급 필요(검증됨) | ✅ |
| 61 | 5팀 봉사 공지 | 팀 봉사 공지 | ⬜ 미검증 | ✅ |
| 33 | 1팀 외부봉사자 공지 | 외부봉사자 공지 | ⬜ 미검증 | ✅ |
| 34 | 2팀 외부봉사자 공지 | 외부봉사자 공지 | ⬜ 미검증 | ✅ |
| 35 | 3팀 외부봉사자 공지 | 외부봉사자 공지 | ⬜ 미검증 | ✅ |
| 36 | 4팀 외부봉사자 공지 | 외부봉사자 공지 | ⬜ 미검증 | ✅ |
| 62 | 5팀 외부봉사자 공지 | 외부봉사자 공지 | ⬜ 미검증 | ✅ |
| 15 | 총무 결산 | 회계 결산 | ⬜ 미검증 | ✅ |
| 66 | 영구회원 신청 | 영구회원 신청 | ⬜ 미검증 | ✅ |
| 65 | 영구회원 활동 신청 | 영구회원 활동 신청 | ⬜ 미검증 | ✅ |
| 70 | 번개 게시판 | 번개 모임 | ⬜ 미검증 | ✅ |
