# 03. 데이터 모델

> 스키마 변경 시 이 문서를 같은 커밋에서 갱신할 것. 조직 관련 수치(팀 수, 인원)는 전부 데이터.

## enum 정의
- `role`: member(부원) | staff(운영진) | board(회장단) | sysadmin(시스템관리자)
- `board_position`: president(회장) | vice_president(부회장) | treasurer(총무)   ← 회장단 3인 직책
- `owner_type`: personal | team | global   ← global 은 공용 템플릿용(owner_id=null, 회장단 편집·전원 사용)
- `visibility`: member | staff | board          ← RAG 문서 공개 범위(질문자 역할 이하만 검색)
- `post_status`: draft → ready → scheduled → published | failed
- `event_status`: draft → published → done | canceled   ← 공지 발행 회차 상태(신청 제거로 단순화, 마이그레이션 0002 적용)

## 테이블
### 조직/계정
- `users` (id, email, name, created_at)
- `memberships` (user_id, role, board_position?, term_start, term_end, status[active|expired])
  - 크론이 매일 term_end 경과 건을 expired로 강등. 회장단만 memberships를 변경 가능.
- `teams` (id, name, kind[activity|functional], is_active, leaders jsonb)
  - leaders: 매 학기 교체되는 팀장단 명단 [{label,name,phone,email?}] (공지 `{{팀장단}}` 자동 삽입). 0006 추가.
    email 은 그 계정에 이 팀 관리 권한 부여용(setTeamRoster 가 저장 시 team_members 로 동기화). 마이그레이션 불필요(JSONB).
    개인정보 — 런타임 입력이며 코드/시드/커밋에 넣지 않는다(규칙 #4).
- `team_members` (team_id, user_id, position[leader|member])   ← 관리 권한 인덱스. 팀장단 명단(leaders.email)에서
    setTeamRoster 가 파생·동기화(별도 UI 없음). 소속 계정 = 회장단/시스템관리자와 함께 그 팀 예약·템플릿 관리 가능.
- `join_codes` (id, code, semester_label, is_active, created_by, created_at)   ← 부원 가입코드(구현됨, 0003)
  - 학기별 가입코드. **활성 코드는 항상 1개**(부분 유니크 인덱스 `where is_active`). 카페 공지로 배포, 회장단 재발급.
    재발급 = 기존 is_active=false + 신규 발급(트랜잭션), audit 기록. 이력은 비활성 행으로 남긴다.
    가입 시 유효 가입코드 대조 + 이메일 OTP. 운영진/회장단 임명은 회장단이 직접(memberships).
  - 기존 `invites`(per-email 토큰)는 이 모델로 대체됨(현재 미사용 — 추후 드롭 여부 확정).
- `email_codes` (id, email, code_hash, purpose[signup|login], expires_at, consumed_at, attempts, created_at)   ← 이메일 OTP(구현됨, 0003)
  - 6자리 OTP. **평문 미저장(HMAC 해시만)**, 만료 10분, 시도 5회 제한, 성공 시 소비. 가입/로그인 공용.
  - 세션은 커스텀 HS256 JWT(httpOnly 쿠키, SESSION_SECRET) — DB 세션 테이블 없음.

### 카페 연동
- `boards` (menuid PK, name, purpose, bot_can_write bool, is_active)   ← 게시판 레지스트리
- `naver_tokens` (id, refresh_token_encrypted, last_refreshed_at, status[ok|error])
- `scheduled_posts` (id, owner_type, owner_id, author_user_id, board_menuid, event_id?,
  title, content_md, image_urls[], publish_at, status, cafe_article_url?,
  fail_reason?, retry_count, approved_by?, created_at, updated_at)
  - event_id: 봉사 회차 연결(0004). 일반 공지는 null. published 전까지 수정·취소.

### 봉사 워크플로 (F1 수동 선예약 중심, 2026-07-23 개정)
- `post_templates` (id, owner_type[personal|team|global], owner_id?, name, title_template, body_template,
  **default_place?, default_capacity?**, updated_by, updated_at, created_at)   ← 발행 양식(구현됨, 0004 / 0007)
  - 제목/본문에 `{{간결_날짜}} {{전체_날짜}} {{집합시간}} {{정원}} {{팀장단}}` 플레이스홀더
    (안내 목록의 유일한 출처 = `src/publishing/placeholder-catalog.ts`).
    **`{{장소}}`는 안내하지 않는다(2026-07-24)** — 양식을 장소별로 만들므로 본문에 "양주 쉼터"처럼 직접 적는다.
    양식의 `default_place` 는 회차 기록용(events.place → 미완성 점검·챗봇 상태질의)이며,
    예전 양식 호환을 위해 `{{장소}}` 치환 자체는 살려 둔다.
    **global**(owner_id=null)=회장단만 편집·전원 사용. team/personal=소유권 규칙(template.manage).
    렌더 시 값 없는 키는 그대로 둔다.
  - **default_place/default_capacity(0007)** = 장소별 양식의 고정 장소·정원(예: "양주 쉼터 봉사" 양식).
    예약 생성 시 `events.place/capacity` 의 **초기값으로 복사**되며, 회차별로 다르면 예약 수정에서 덮어쓴다.
    정원은 새 예약 화면에서 **일정(회차)별로 직접 지정**할 수도 있다(우선순위: 회차별 입력 > 양식 기본값 > 빈 값).
  - **치환 2단계(결정 2026-07-24)**: ① 생성 시 = 회차가 정해지는 값(날짜/집합시간/팀장단)을 본문에 굳힘
    (`batch-generate.ts`, `reservations.ts`). ② 발행 직전 = `{{장소}}{{정원}}` 등 남은 키를 **events 값으로**
    치환(`final-render.ts`). events 가 장소·정원의 유일한 저장소이므로 회차별 수정이 본문과 어긋날 수 없다.
    치환 후에도 남은 키가 있으면 **게시하지 않는다**(markReady 차단 + 워커가 failed 확정, audit `post.blocked`).
    발행 성공 시 치환된 최종 제목·본문을 `scheduled_posts` 에 저장한다(발행된 글은 수정 불가 = 이 기록이 원본).
- `recurring_rules` (id, team_id, label, month_week[1..4|last], weekday, time(봉사 집합시간),
  board_menuid, template_id?, notice_lead_days default 7, publish_time default 20:00, is_active)   ← 0004/0005
  - **역할 = 일괄 생성 도우미의 저장된 프리셋**(크론 자동 생성 아님). template_md→template_id 이관,
    draft_lead_days 제거. 테이블명은 리네임 마이그레이션 회피 위해 유지(실체 = generation preset).
- `events` (id, team_id, rule_id?, title, event_date, meet_time, place, capacity, status, created_at)
  - **봉사 회차 = 예약 폼과 통합**: 일시(event_date/meet_time)·장소·정원이 event 에 저장되어
    챗봇 상태 질의("이번 주 봉사 어디야")의 **원천**. 필수 필드(event_date, place, capacity) 미완성 시
    발행 불가(F1 안전장치, markReady 가 검증). scheduled_posts.event_id 로 연결(post→event 다대일).
  - **스코프 피벗(2026-07-23)**: 신청/확정/오픈채팅 제거(0001). `events.scheduled_post_id` 제거(0004,
    연결은 scheduled_posts.event_id 로 통일). 신청=카페 댓글, 수합=팀장단 수동.
- `notice_check_log` (id, scheduled_post_id, notice_date, created_at, UNIQUE(scheduled_post_id, notice_date))   ← 0004
  - 미완성 점검 알림 중복 방지. 발행 D-3/D-1 미완성(draft) 예약에 하루 1회만 알림.
- `scheduled_posts`: **event_id 추가(0004)** — 봉사 회차 연결(일반 공지는 null, 같은 발행 큐 공용).
  published 전까지 수정·취소(cancelPost) 가능.

### RAG/챗봇
- `documents` (id, title, content_md, visibility, owner_type, owner_id,
  updated_by, updated_at, pii_checked bool)
- `doc_chunks` (id, document_id, chunk_index, content, embedding vector)
  - 문서 저장 시 청크 전체 재생성(delete → insert). visibility는 조인으로 상속.
- `chat_logs` (id, user_id?, role_at_time, question, answer, sources[], handed_off bool, created_at)

### 운영 공통
- `audit_logs` (id, actor_user_id, action, target_table, target_id,
  before_json?, after_json?, created_at)
  - 대상: memberships/teams/boards/documents/scheduled_posts/events 변경, 학기 전환, 토큰 갱신 실패.
    (Phase 2 추가 시 dues/expenses/recruit_applicants 변경도 포함)

### Phase 2 예정 모듈 (F8 총무 / F9 신입모집) — 설계 확정(2026-07-23), 마이그레이션은 착수 시점
> 스키마는 아래로 확정. 실제 테이블 생성은 Phase 2 각 모듈 착수 시 마이그레이션으로 반영한다.
- **F8 총무** (접근 = **총무 + 회장단만**. 일반 운영진·부원 불가. 자동이체/결제/정산 접수 금지):
  - `dues` (id, user_id, semester_label, status[unpaid|paid|exempt], checked_at?, memo?, updated_by, updated_at)
    — 학기 단위. semester_label 기준 부원 명단 스냅샷 대비 납부 상태 체크. UNIQUE(user_id, semester_label).
    **금액·계좌 정보는 저장하지 않는다**(민감정보 최소화).
  - `expenses` (id, spent_on date, category[operating|event|etc], description, amount, receipt_url?,
    recorded_by, memo?, created_at) — 지출 기록 대장. 영수증 이미지 = Supabase Storage(비공개 버킷) URL.
    수정 이력은 audit_logs 로. **승인 플로우 없음**(결재 시스템 아님, 기록 대장). 정산 요청 접수는 v2.
- **F9 신입 모집** (지원자 = 비부원, PII 최소화·보관 제한):
  - `recruit_applicants` (id, cohort, name, phone_hash, status[received|doc_pass|interview|final_pass|fail],
    memo?, uploaded_by, created_at) — 운영진 CSV 업로드. 상태 5단계(접수→서류합격→면접예정→최종합격|불합격).
    **전화번호 원문은 저장하지 않고 이름+전화번호 전체의 해시(phone_hash)만 저장**. 결과 조회는
    이름+전화번호 전체 입력을 해시 대조해 본인 상태만 노출(뒤 4자리 방식은 동명이인·무차별 대입에 약해 폐기).
    모집 종료 시 cohort 단위 **일괄 hard delete**(비부원 개인정보 보관 금지). 정적 안내 페이지는 LLM 미사용.
  - 조회 보호: 실패 메시지 단일화("입력 정보를 확인해주세요"), IP당 분당 5회 제한, 실패 10회 시 해당 IP
    1시간 차단, 시도 로그 기록(`recruit_lookup_attempts` 또는 동등 저장).
  - RLS: 위 신규 테이블도 생성과 동시에 RLS 활성화(규칙 #8, RLS 테스트가 누락을 자동 감지).

## 접근 규칙 (서버에서 강제)
1. 쓰기 요청마다: 인증 → membership active? → 역할 충족? → 소유권(personal=본인,
   team=team_members 포함) 충족? → 통과 시 실행 + audit 기록.
2. 회장단/시스템관리자는 소유권 검사 우회 가능(단, audit에 override로 기록).
3. `documents` 저장 시 PII 패턴(전화번호, 주민번호 형식, "계좌") 감지되면 경고 + pii_checked
   확인 요구.
4. 챗봇 검색 SQL: `WHERE visibility_rank <= 질문자_role_rank` 를 항상 포함.
   챗봇은 **로그인 사용자 전용**(비로그인 public 공개 없음, visibility 에 public 단계 추가 안 함).
   쿼터(결정 2026-07-23): **인당 일 30회** + **전역 분기 상한**(분기 예산 1만원 ÷ 모델 단가로 호출 수
   환산). 카운트는 chat_logs 기준. 상한값은 상수 하드코딩 금지 — 설정 테이블 값으로 두어 회장단이
   콘솔에서 수정. 전역 상한 도달 시: 챗봇만 비활성 + 안내 문구 표시 + 회장단 메일 알림.
   설계: `app_settings` (key, value_json, updated_by, updated_at) 같은 설정 테이블(챗봇 v1 착수 시 신설).

## 상태머신 요약
- scheduled_posts: draft(작성중) → ready(필수값 완성) → scheduled(발행 대기)
  → published(성공, cafe_article_url 기록) / failed(재시도 2회 후, 알림 발송)
- events(공지 발행 회차): draft(초안, 필수값 미완성 포함) → published(카페 발행 완료) →
  done(활동일 경과) | canceled. 신청/확정 상태 없음(신청은 카페 댓글). enum 마이그레이션 0002 적용.
- 학기 전환: 회장단 실행 → 유임 체크 명단 외 memberships 일괄 expired → 신규 invites 발급
  → 전 과정 audit 1건으로 묶어 기록
