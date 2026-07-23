# 03. 데이터 모델

> 스키마 변경 시 이 문서를 같은 커밋에서 갱신할 것. 조직 관련 수치(팀 수, 인원)는 전부 데이터.

## enum 정의
- `role`: member(부원) | staff(운영진) | board(회장단) | sysadmin(시스템관리자)
- `board_position`: president(회장) | vice_president(부회장) | treasurer(총무)   ← 회장단 3인 직책
- `owner_type`: personal | team
- `visibility`: member | staff | board          ← RAG 문서 공개 범위(질문자 역할 이하만 검색)
- `post_status`: draft → ready → scheduled → published | failed
- `event_status`: draft → published → done | canceled   ← 공지 발행 회차 상태(신청 제거로 단순화, 마이그레이션 0002 적용)

## 테이블
### 조직/계정
- `users` (id, email, name, created_at)
- `memberships` (user_id, role, board_position?, term_start, term_end, status[active|expired])
  - 크론이 매일 term_end 경과 건을 expired로 강등. 회장단만 memberships를 변경 가능.
- `teams` (id, name, kind[activity|functional], is_active)
- `team_members` (team_id, user_id, position[leader|member])   ← 팀장단 = leader, 인원 가변
- `join_codes` (id, code, semester_label, is_active, created_by, created_at)   ← 부원 가입코드(결정 2026-07-23)
  - 학기별 가입코드. **활성 코드는 항상 1개**(is_active=true 유일). 카페 공지로 배포, 회장단 재발급.
    재발급 = 기존 코드 is_active=false + 신규 발급, audit 기록. 이력은 비활성 행으로 남긴다.
    가입 시 로그인 매직링크 + 유효 가입코드 대조. 운영진/회장단 임명은 회장단이 직접(memberships).
  - 기존 `invites`(per-email 토큰)는 이 모델로 대체 → 인증 구현 시 invites 드롭 여부 확정.
    인증 미착수(Gmail SMTP 대기)라 join_codes 마이그레이션은 인증 구현 시점에.

### 카페 연동
- `boards` (menuid PK, name, purpose, bot_can_write bool, is_active)   ← 게시판 레지스트리
- `naver_tokens` (id, refresh_token_encrypted, last_refreshed_at, status[ok|error])
- `scheduled_posts` (id, owner_type, owner_id, author_user_id, board_menuid,
  title, content_md, image_urls[], publish_at, status, cafe_article_url?,
  fail_reason?, retry_count, approved_by?, created_at, updated_at)

### 봉사 워크플로
- `recurring_rules` (id, team_id, label, month_week[1..4|last], weekday, time,
  board_menuid, template_md, draft_lead_days default 3, is_active)
- `events` (id, team_id, rule_id?, title, event_date, meet_time, place,
  capacity, status, scheduled_post_id?, created_at)
  - 공지 발행용 회차 데이터. 필수 필드(event_date, place, capacity) 미완성 시 발행 불가(F1 안전장치).
  - **스코프 피벗(2026-07-23)**: 신청/확정/오픈채팅 제거 → `applications` 테이블·`confirm_mode`·
    `openchat_url/code` 폐기(마이그레이션 0001 적용). 신청=카페 댓글(현행), 수합=팀장단 수동.

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
