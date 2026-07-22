# 03. 데이터 모델

> 스키마 변경 시 이 문서를 같은 커밋에서 갱신할 것. 조직 관련 수치(팀 수, 인원)는 전부 데이터.

## enum 정의
- `role`: member(부원) | staff(운영진) | board(회장단) | sysadmin(시스템관리자)
- `board_position`: president(회장) | vice_president(부회장) | treasurer(총무)   ← 회장단 3인 직책
- `owner_type`: personal | team
- `visibility`: member | staff | board          ← RAG 문서 공개 범위(질문자 역할 이하만 검색)
- `post_status`: draft → ready → scheduled → published | failed
- `event_status`: draft → recruiting → closed → done | canceled
- `application_status`: applied → confirmed | waitlisted | canceled
- `confirm_mode`: fcfs(선착순 자동) | manual(팀장단 선발)

## 테이블
### 조직/계정
- `users` (id, email, name, created_at)
- `memberships` (user_id, role, board_position?, term_start, term_end, status[active|expired])
  - 크론이 매일 term_end 경과 건을 expired로 강등. 회장단만 memberships를 변경 가능.
- `teams` (id, name, kind[activity|functional], is_active)
- `team_members` (team_id, user_id, position[leader|member])   ← 팀장단 = leader, 인원 가변
- `invites` (id, email, target_role, target_team?, token, expires_at, used_at, invited_by)

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
  capacity, confirm_mode, status, openchat_url?, openchat_code?,
  scheduled_post_id?, created_at)
  - 필수 필드(event_date, place, capacity, openchat_url/code) 미완성 시 발행 불가(안전장치).
- `applications` (id, event_id, user_id, status, applied_at, decided_at?, decided_by?)
  - UNIQUE(event_id, user_id). 확정자에게만 openchat 정보 노출.

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

## 접근 규칙 (서버에서 강제)
1. 쓰기 요청마다: 인증 → membership active? → 역할 충족? → 소유권(personal=본인,
   team=team_members 포함) 충족? → 통과 시 실행 + audit 기록.
2. 회장단/시스템관리자는 소유권 검사 우회 가능(단, audit에 override로 기록).
3. `documents` 저장 시 PII 패턴(전화번호, 주민번호 형식, "계좌") 감지되면 경고 + pii_checked
   확인 요구.
4. 챗봇 검색 SQL: `WHERE visibility_rank <= 질문자_role_rank` 를 항상 포함.

## 상태머신 요약
- scheduled_posts: draft(작성중) → ready(필수값 완성) → scheduled(발행 대기)
  → published(성공, cafe_article_url 기록) / failed(재시도 2회 후, 알림 발송)
- events: recruiting 중 정원 도달 또는 마감시각 → closed → (활동일 경과) done
- 학기 전환: 회장단 실행 → 유임 체크 명단 외 memberships 일괄 expired → 신규 invites 발급
  → 전 과정 audit 1건으로 묶어 기록
