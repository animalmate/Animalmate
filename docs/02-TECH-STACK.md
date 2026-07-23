# 02. 기술 스택 & 아키텍처 (v2 — 무료 티어 제약 검증 반영)

> 설계 기준 3가지: ① 고정비 최소(도메인+LLM 크레딧 외 0원) ② 관리자 교체 가능(조직 계정·문서화)
> ③ 보안(기본 거부, 서버 강제). v1→v2 변경: 스케줄러를 Vercel Cron에서 **Supabase pg_cron으로 이관**
> (Hobby 크론은 하루 1회 제한), keep-alive·백업·SMTP 항목 추가.

## 1. 스택 (결정 + 이유)
| 영역 | 선택 | 이유 / 비용 |
|---|---|---|
| 프레임워크 | Next.js (App Router) + TypeScript | 웹앱+API 단일 리포. 무료 |
| 호스팅 | Vercel Hobby | 무료(비상업 용도 — 비영리 동아리 해당). **Cron 기능은 사용 금지** |
| 스케줄러 | **Supabase pg_cron + pg_net** | 분 단위 가능·무료. HTTP로 우리 API(CRON_SECRET 보호) 호출 |
| DB/인증/벡터/스토리지 | Supabase Free | Postgres+pgvector+Auth(매직링크)+Storage. 무료 |
| ORM | Drizzle | 서버리스 친화, 마이그레이션 파일 기반 |
| LLM(생성) | **Gemini 3.1 Flash-Lite (유료 티어)** | 유료 티어로 확정. 프롬프트 캐싱으로 비용 절감. 하드 한도+알림 필수. **구형 2.0 계열 모델명 사용 금지**(코드·프롬프트·문서 전부 3.x 계열만). 코드는 `GEMINI_MODEL` 환경변수로 읽음(기본값 하드코딩 금지) |
| LLM(임베딩) | Gemini 최신 임베딩 모델 | 구형 2.0 계열 금지. 코드는 `GEMINI_EMBEDDING_MODEL` 환경변수로 읽음. 정확한 ID는 Phase 1에서 콘솔 확인 후 핀 고정 |
| 이메일 | **Gmail SMTP(공용 계정 앱 비밀번호)** | 가입코드·알림·핸드오프. **Supabase Auth 커스텀 SMTP + 앱 알림 공용**. 무료 Gmail ~500통/일 한도(300명 규모 감내, 학기초 버스트만 유의) |
| 모니터링 | UptimeRobot Free(5분 핑) + Sentry Free | 가동 감시 + keep-alive 겸용. 알림 = 공용 메일 |
| 백업 | GitHub Actions 주 1회 pg_dump | 무료 티어는 자동 백업 없음 → 자체 백업 |

고정비 총액: 도메인 연 ~2만원 + LLM 크레딧 월 수천 원. 그 외 전부 무료 티어.

## 2. 아키텍처 개요
```
부원/운영진 브라우저
   │  (Supabase Auth 매직링크로 로그인만. DB 직접 접근 없음)
   ▼
Next.js @ Vercel ── API Routes: 인증·역할·소유권·임기 검증 (서버 강제)
   │        ├── Supabase Postgres (RLS 전면 활성화 = 기본 거부, service role은 서버 전용)
   │        ├── pgvector: 문서 청크 (visibility 필터를 SQL로 강제)
   │        └── LLM API (서버에서만 호출, 사용자별 일일 쿼터)
   ▲
Supabase pg_cron (분 단위) ──pg_net HTTP──▶ /api/cron/* (CRON_SECRET 검증)
   ├── 매분: 발행 워커 (due인 scheduled_posts → 카페 글쓰기 API)
   ├── 매일 09:00: 발행 D-3 **미완성 점검**(필수 필드 빈 예약) → 팀장단 알림 (자동 초안 생성 아님)
   ├── 매일 00:10: 임기 만료 강등
   └── 매일: 네이버 refresh token 선제 갱신
   ※ 이벤트 마감/정원 처리 크론 제거(스코프 피벗 — 신청은 카페 댓글, 시스템이 마감 안 함)
외부: UptimeRobot ──5분──▶ /api/health (경량 DB SELECT → 일시정지 방지 + 감시)
```

## 3. 무료 티어 함정과 대응 (검증 완료 — 반드시 준수)
1. **Vercel Hobby Cron 금지**: 하루 1회 제한 + 시간 단위 정밀도(지정 시각 미보장) + 재시도 없음
   + 10초 타임아웃. 정시 발행 불가 → 모든 스케줄은 pg_cron으로. 발행 워커는 1회 실행당
   소량(예: 5건)만 처리해 함수 타임아웃을 피한다.
2. **Supabase 7일 미사용 일시정지**: 무료 프로젝트는 7일간 요청이 없으면 자동 정지되고,
   정지 후 장기간 방치 시 복구 불가(약 90일 창). 대응: /api/health가 DB를 1회 조회하고
   UptimeRobot이 5분마다 호출(+pg_cron 자체 활동도 보조). 이 링크가 끊기면 방학 중 서비스가
   죽는다는 사실을 장애 대응 가이드에 명시.
3. **자동 백업 없음**: 무료 티어는 백업 미제공. GitHub Actions 주 1회 pg_dump → age/GPG
   암호화 → 비공개 저장소(또는 비공개 아티팩트)에 보관. 암호화 키는 비밀번호 금고에.
   **평문 덤프를 공개 리포에 올리지 않는다(PII).** 학기 1회 복원 리허설.
4. **Supabase 기본 인증 메일 한도**: 기본 SMTP는 시간당 수 건 수준이라 300명 매직링크 운영
   불가 → Auth 설정에서 커스텀 SMTP(**Gmail 공용 계정 앱 비밀번호**)를 반드시 연결. Gmail 일일 한도
   (~500통) 내에서 운영하되, 학기초 대량 가입 시 발송 분산·재시도 고려.
5. Supabase Free 용량 참고: DB 500MB / Storage 1GB / MAU 5만 / Edge 호출 50만/월 —
   300명 규모에 충분. 이미지 원본은 카페에 있으므로 Storage는 발행용 임시 저장 + 총무 영수증
   이미지(F8, 비공개 버킷)만.
6. Phase 2 추가 모듈: F8 총무(회비 현황·지출 대장), F9 신입 모집(정적 안내 + 결과 조회).
   신입 지원자 PII는 최소 저장·모집 종료 시 일괄 삭제(01-PRD §7-8).

## 4. 보안 원칙 (관리자 교체를 전제로 한 기본 거부 설계)
- **RLS 전면 활성화 + 정책 미부여 = 기본 거부.** anon key로는 어떤 테이블도 직접 읽고 쓸 수 없다.
  데이터 접근은 전부 Next.js 서버(service role key, 서버 환경변수 전용) 경유. 이 구조 덕에
  에이전트가 실수로 클라이언트 쿼리를 짜도 데이터가 새지 않는다.
- 인증: **학기별 가입코드**(카페 공지로 배포, 회장단 재발급)로 부원 가입 + 로그인은 이메일
  매직링크. 세션 만료 기본값 유지. 회장단·시스템관리자 계정과 인프라 대시보드(GitHub/Supabase/Vercel)는 2FA.
- 크론 엔드포인트: Authorization 헤더의 CRON_SECRET 검증 없이는 무조건 401.
- 챗봇: **로그인 사용자 전용**. 남용 방지 = 사용자별 일일 질문 쿼터 **+ 전역 일일 상한**(DB 카운터,
  chat_logs 기준)으로 LLM 비용 폭주 차단 + 시스템 프롬프트 인젝션 방어 + 개인정보 질의 거절.
- **챗봇 retrieval = visibility 필터(질문자 역할 기준)**: 검색은 항상 질문자의 role 이하 문서만
  대상으로 한다(`WHERE visibility_rank <= 질문자_role_rank`, 03-DATA-MODEL §4). 필터는 검색
  SQL 레벨에서 강제하며, 애플리케이션 후처리로 대체하지 않는다.
- **입력창 고지**: 챗봇 입력창 안내 문구는 **'개인정보 입력 금지' 하나만 유지**한다(다른 고지 문구는
  두지 않는다). PII 미입력 유도가 목적이며, 서버측 개인정보 질의 거절과 이중으로 작동한다.
- **프롬프트 캐싱 적용**: 시스템 프롬프트·공통 지시문 등 반복되는 프리픽스는 Gemini 프롬프트
  캐싱으로 재사용해 유료 티어 토큰 비용을 줄인다. 캐시 키에 개인정보/가변 검색결과를 넣지 않는다.
- 네이버 refresh token은 TOKEN_ENCRYPTION_KEY로 암호화 저장. 키 로테이션 절차 문서화.
- 감사: 관리 행위 전건 audit_logs. 학기 전환·권한 변경은 특히.

## 5. 네이버 카페 API 제약 (변경 없음 — 요약)
- 제공: 카페 가입, 글쓰기(POST /v1/cafe/{clubid}/menu/{menuid}/articles)뿐.
  읽기/수정/삭제/댓글 없음(00 규칙 참조). subject/content UTF-8 URL 인코딩, 이미지는
  multipart(여러 장은 파라미터 반복). menuid는 boards 테이블에서 조회(하드코딩 금지).
- 앱은 동아리 조직 계정 소유, 개발 상태 앱은 등록 멤버(봇 계정)만 호출 가능. 일일 한도는
  콘솔 수치 기록. 봇 계정 비밀번호 변경 시 재동의 필요.

## 6. 환경 변수 (env.example과 동기화)
```
NEXT_PUBLIC_APP_URL=
SUPABASE_URL= / SUPABASE_ANON_KEY= / SUPABASE_SERVICE_ROLE_KEY=   # service role은 서버 전용
GEMINI_API_KEY= / GEMINI_MODEL= / GEMINI_EMBEDDING_MODEL=   # 서버 전용. 챗봇(1D) 착수 시 추가
NAVER_CLIENT_ID= / NAVER_CLIENT_SECRET= / NAVER_CAFE_CLUB_ID=
NAVER_PUBLISH_DRY_RUN=true        # 'false' 일 때만 실제 카페 발행
TOKEN_ENCRYPTION_KEY=             # naver_tokens 암호화/복호화
CRON_SECRET=                      # pg_net 호출 헤더와 일치해야 함
SESSION_SECRET=                   # 세션 JWT 서명 + 이메일 OTP HMAC
SMTP_HOST= / SMTP_PORT= / SMTP_USER= / SMTP_PASS= / SMTP_FROM=   # Gmail 공용 계정 발송
# NAVER_REFRESH_TOKEN 은 최초 부트스트랩 후 DB(naver_tokens)로 이관 → 앱/Vercel 미등록.
# BACKUP_ENCRYPTION_KEY 는 앱 변수 아님 — GitHub Actions 시크릿 전용(백업 암호화).
```

## 7. 계정·이관 원칙 (요약 — 상세는 자산 대장)
- 모든 인프라 계정은 동아리 공용 이메일 소유. GitHub는 Organization, 개발자는 멤버.
- 운영진 교체 시 로테이션: 비밀번호 전체 → API 키 재발급 → CRON_SECRET/암호화 키 →
  복구 전화번호 → 결제수단. 절차는 인수인계 문서에.
