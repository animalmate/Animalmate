# 03. 데이터 모델

> 스키마 변경 시 이 문서를 같은 커밋에서 갱신할 것. 조직 관련 수치(팀 수, 인원)는 전부 데이터.

## enum 정의
- `role`: member(부원) | staff(운영진) | board(회장단) | sysadmin(시스템관리자)
- `board_position`: president(회장) | vice_president(부회장) | treasurer(총무)   ← 회장단 3인 직책
- `owner_type`: personal | team | global   ← global 은 공용 템플릿용(owner_id=null, 회장단 편집·전원 사용)
- `visibility`: member | staff | board          ← RAG 문서 공개 범위(질문자 역할 이하만 검색)
- `post_status`: draft → ready → scheduled → **publishing** → published | failed
  - `publishing` = 발행 워커가 조건부 UPDATE 로 점유한 상태(마이그레이션 0017). pg_cron 이 매분 도는데
    한 사이클은 건당 30초라 5건이면 2분 걸린다 — 점유가 없으면 다음 워커가 아직 `scheduled` 인 같은 글을
    다시 집어 가 **카페에 중복 게시**된다(카페는 삭제 API 가 없어 되돌릴 수 없다).
  - `updated_at` 이 점유의 임차 시각. `PUBLISH_LEASE_MS`(10분)를 넘긴 `publishing` 은 워커가 죽은 것으로
    보고 회수한다. 결과 반영(`applyPublishResult`)도 `status='publishing'` 일 때만 적용해,
    임차가 만료돼 회수된 뒤 뒤늦게 끝난 워커가 남의 결과를 덮어쓰지 못하게 한다.
- `event_status`: draft → published → done | canceled   ← 공지 발행 회차 상태(신청 제거로 단순화, 마이그레이션 0002 적용)
  - ⚠ **enum 에는 4개가 있지만 코드가 실제로 쓰는 값은 `draft`(생성)와 `canceled`(예약 취소)뿐이다**
    (2026-07-28 확인). `published`·`done` 으로 전이시키는 코드가 없다. 챗봇 노출 판정도 status 가 아니라
    "취소 아님 + 장소 있음"으로 한다(07-DECISIONS 24). 나머지 두 값은 지금은 쓰이지 않는 자리다.

## 테이블
### 조직/계정
- `users` (id, email, name, phone?, session_version, withdrawn_at?, created_at)
  - `session_version`: 세션 세대(0010). 발급된 JWT 에 이 값을 담고 요청마다 대조 — 값을 1 올리면
    그 계정의 **모든 기기 세션이 즉시 무효**. 세션 테이블 불필요. 올라가는 경우 3가지(07-DECISIONS 11·13):
    ① 회원 관리 > "모든 기기에서 로그아웃" ② **비활성화** ③ **강등**(승격·재활성화는 올리지 않는다).
  - `phone`: 연락처(0012 추가). **가입 시 입력, 본인이 내 정보에서 수정**. 봉사 공지 `{{팀장단}}`에
    팀장단 배정된 계정의 이름·전화로 자동 삽입된다. PII — RAG 인덱스 금지(규칙 #5), 코드/시드/커밋 금지(규칙 #4).
  - `withdrawn_at`: 탈퇴 시각(0018). 값이 있으면 **탈퇴 계정** — `loadActor` 가 영구 거부하고
    회원 명단(`listMembers`)에서도 빠진다. 탈퇴 = 행 삭제가 아니라 **개인정보 삭제 + 영구 잠금**:
    name→'탈퇴한 회원', email→`withdrawn+<id>@animalmate.invalid`, phone→null, 멤버십 전부 expired,
    팀 배정 삭제, session_version+1. 행을 남기는 이유는 `scheduled_posts`·`post_templates`·`documents`·
    `join_codes`·`recruit_cohorts` 의 `created_by` 가 이 행을 참조해 DELETE 가 거부되고,
    `audit_logs.actor_user_id`(ON DELETE SET NULL)를 지우면 "누가 했는지"가 사라지기 때문(규칙 #4).
    원래 이메일을 남기지 않으므로 **같은 주소로 재가입 가능**(별개의 새 계정). 07-DECISIONS 30.
- `memberships` (user_id, role, board_position?, term_start, term_end, status[active|expired])
  - 크론이 매일 term_end 경과 건을 expired로 강등. 회장단만 memberships를 변경 가능.
- `teams` (id, name, kind[activity|functional], is_active, leaders jsonb)
  - leaders(0006): **앱 미가입자 전용** 수동 팀장단 [{label,name,phone}] (공지 `{{팀장단}}`에 자동 명단 뒤로 덧붙음).
    가입 팀장단은 여기 두지 않고 team_members(position=leader)로 관리. 같은 전화번호는 공지에서 자동 명단과 중복 제거.
    개인정보 — 런타임 입력이며 코드/시드/커밋에 넣지 않는다(규칙 #4). setTeamManualLeaders 가 저장.
- `team_members` (team_id, user_id, position[leader|member], label?)   ← 팀 소속·직함(0012 label 추가).
    **회원 관리에서 회원별로 배정**(setUserTeams). position=leader = 공지 `{{팀장단}}` 노출, label = 직함(팀장/부팀장).
    소속 계정 = 회장단/시스템관리자와 함께 그 팀 예약·템플릿 관리 가능. 배정되면 member→staff, 마지막 팀 해제 시 staff→member.
- `join_codes` (id, code, semester_label, is_active, created_by, created_at)   ← 부원 가입코드(구현됨, 0003)
  - 학기별 가입코드. **활성 코드는 항상 1개**(부분 유니크 인덱스 `where is_active`). 카페 공지로 배포, 회장단 재발급.
    재발급 = 기존 is_active=false + 신규 발급(트랜잭션), audit 기록. 이력은 비활성 행으로 남긴다.
    가입 시 유효 가입코드 대조 + 이메일 OTP. 운영진/회장단 임명은 회장단이 직접(memberships).
  - 기존 `invites`(per-email 토큰)는 이 모델로 대체됨 → **삭제됨(마이그레이션 0020, 2026-07-28)**. 0행 확인 후 DROP.
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
    `{{정원}}` 은 단위까지 채운다("20" 아닌 **"20명"** — `capacityText()`). 양식 본문에 "명"을 또 쓰지 말 것.
    **`{{장소}}`는 안내하지 않는다(2026-07-24)** — 양식을 장소별로 만들므로 본문에 "양주 쉼터"처럼 직접 적는다.
    양식의 `default_place` 는 회차 기록용(events.place → 미완성 점검·챗봇 상태질의)이며,
    예전 양식 호환을 위해 `{{장소}}` 치환 자체는 살려 둔다.
    **global**(owner_id=null)=회장단만 편집·전원 사용. team/personal=소유권 규칙(template.manage).
    렌더 시 값 없는 키는 그대로 둔다.
  - **양식별 기본값**: `default_place`/`default_capacity`(0007) + `default_meet_time`/`default_publish_time`(0008).
    예약을 만들 때 각 일정 행에 **미리 채워지고**(회차별로 고칠 수 있음), 그래서 실제로 고르는 값은
    **봉사 일자와 업로드 날짜 둘뿐**이다. place/capacity 는 `events` 의 초기값이 된다.
    우선순위: 회차별 입력 > 양식 기본값 > 빈 값.
  - **치환 2단계(결정 2026-07-24)**: ① 생성 시 = 회차가 정해지는 값(날짜/집합시간/팀장단)을 본문에 굳힘
    (`reservations.ts`). ② 발행 직전 = `{{장소}}{{정원}}` 등 남은 키를 **events 값으로**
    치환(`final-render.ts`). events 가 장소·정원의 유일한 저장소이므로 회차별 수정이 본문과 어긋날 수 없다.
    치환 후에도 남은 키가 있으면 **게시하지 않는다**(markReady 차단 + 워커가 failed 확정, audit `post.blocked`).
    발행 성공 시 치환된 최종 제목·본문을 `scheduled_posts` 에 저장한다(발행된 글은 수정 불가 = 이 기록이 원본).
- ~~`recurring_rules`~~ — **삭제됨(마이그레이션 0020, 2026-07-28)**. 일괄 생성 도우미를 없앤
  2026-07-24 이후로 읽고 쓰는 코드(`batch-generate.ts`, `recurring-rules.ts`, `month-weekday.ts`,
  `/reservations/batch`, `/api/reservations/batch`)가 전부 사라졌고, 데이터 보존을 위해 남겨 두었으나
  **0행이라 보존할 것도 없었다**. `events.rule_id` 컬럼과 `month_week` enum 도 함께 제거.
- `events` (id, team_id, title, event_date, meet_time, place, capacity, status, created_at)
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
  - ⚠ **pgvector 확장은 `extensions` 스키마에 있다**(0021, 2026-07-29 이전). `public` 이 아니다.
    앱은 `postgres` 롤로 붙고 search_path 가 `"$user", public, extensions` 라 `::vector`·`<=>`·
    `vector_cosine_ops` 를 스키마 없이 써도 해석된다. search_path 에서 `extensions` 를 빼면
    챗봇 검색이 "type vector does not exist" 로 죽는다.
- `chat_logs` (id, user_id?, role_at_time, question, answer, sources[], handed_off bool, created_at)

### 운영 공통
- `audit_logs` (id, actor_user_id, action, target_table, target_id,
  before_json?, after_json?, created_at)
  - 대상: memberships/teams/boards/documents/scheduled_posts/events 변경, 학기 전환, 토큰 갱신 실패.
    (Phase 2 추가 시 dues/expenses/recruit_applicants 변경도 포함)
- `rate_limits` (bucket, identifier, window_start, count)   ← 레이트 리밋 카운터(구현됨, 0009)
  - UNIQUE(bucket, identifier, window_start). 고정 윈도 방식 — 원자적 UPSERT 로 세므로
    서버리스 인스턴스가 몇 개든 합산된다(메모리 카운터는 Vercel 에서 무력).
  - 적용 지점: `signup_request`(IP, 10회/시간) · `login_request`(IP, 10회/시간) ·
    `otp_verify`(IP, 20회/시간 — 가입·로그인 검증이 **같은 버킷을 공유**해 번갈아 써도 상한이 늘지 않는다) ·
    `mail_to_address`(**수신 이메일**, 5회/시간 — 가입·로그인 요청 공용. 계정 열거 차단으로 기가입 주소에도
    안내 메일이 나가므로, IP 를 바꿔 가며 특정인 메일함을 채우는 경로를 주소 단위로 막는다).
  - 지난 윈도 행은 일일 크론(`/api/cron/draft-generate`)이 `pruneRateLimits` 로 정리.

### Phase 2 모듈 — F9 신입모집(**구현 완료**) / F8 총무(**미착수**)
> **F9 는 이미 만들어져 돌고 있다**(마이그레이션 0013~0019). 아래 F9 항목은 설계가 아니라 현재 스키마다.
> **F8 은 테이블·라우트·화면이 전부 0** — 아래 스키마만 확정돼 있고 착수 시점에 마이그레이션한다.
> ⚠ F8 을 만들 때 함께 필요한 것: 현재 `authorize()` 에는 총무용 Action 이 없고
> `board_position='treasurer'` 를 권한 판단에 쓰는 코드도 없다. "총무만" 권한은 새로 만들어야 한다.
- **F8 총무** (접근 = **총무 + 회장단만**. 일반 운영진·부원 불가. 자동이체/결제/정산 접수 금지):
  - `dues` (id, user_id, semester_label, status[unpaid|paid|exempt], checked_at?, memo?, updated_by, updated_at)
    — 학기 단위. semester_label 기준 부원 명단 스냅샷 대비 납부 상태 체크. UNIQUE(user_id, semester_label).
    **금액·계좌 정보는 저장하지 않는다**(민감정보 최소화).
  - `expenses` (id, spent_on date, category[operating|event|etc], description, amount, receipt_url?,
    recorded_by, memo?, created_at) — 지출 기록 대장. 영수증 이미지 = Supabase Storage(비공개 버킷) URL.
    수정 이력은 audit_logs 로. **승인 플로우 없음**(결재 시스템 아님, 기록 대장). 정산 요청 접수는 v2.
- ~~**F9 신입 모집**: `recruit_applicants`(phone_hash 만 저장)~~ **개정·구현 2026-07-25**(결정 #7 번복,
  07-DECISIONS 24, 상세 설계 = `09-RECRUIT-DESIGN.md`). v1은 서류·면접 심사를 사이트에서 직접 수행하므로
  구글폼 전 필드를 **원문 저장**한다(마이그레이션 0013, 전 테이블 RLS ON). 대신 주소는 역명으로 축소,
  열람 staff+/export board-only, cohort hard delete 로 보관을 제한한다. 조회는 이름+전화 정확 일치(해시 폐기),
  실패 시도값은 저장하지 않고 IP 레이트리밋으로만 막는다.
  - `recruit_cohorts` (id, label uq, schedule_public, result_public, notice_content?, notice_images? jsonb,
    congrats_message?, post_pass_notice?, is_closed, venues? jsonb, duty_roles? jsonb, closed_at?, archived_stats? jsonb,
    created_by, created_at) — 공개 스위치 2개(면접 일정/최종 결과)가 여기. `notice_*`/`congrats_message`/
    `post_pass_notice`/`is_closed`/`venues` 는 공개 공고·마감 스위치·면접 장소 프리셋용(0014).
    `duty_roles` 는 면접 당일 대기실 업무 이름 목록(0019) — `recruit_duty_assignments` 의 열이 된다.
    `notice_images` 는 **Supabase Storage 공개 버킷 `recruit-notice` 의 URL 목록**이다(파일 본체는 DB 에 두지 않는다).
    예전에는 base64 문자열을 그대로 넣어 포스터 몇 장이면 행 하나가 수 MB 였고, 공고를 볼 때마다 그 행이 통째로 오갔다.
    `apply_form` jsonb(0015) = 공개 지원서의 **문항별 문구·안내·필수 여부 + 선택지 목록**
    (`src/recruit/apply-form.ts` ApplyFormConfig, 기본값은 33기 구글폼 원문). 문항 제목을 비우면
    그 항목을 받지 않는다. 비대면 면접만 라디오가 아니라 체크박스(체크=비대면, 미체크=대면).
    ⚠ **항목 구성 자체는 고정**이다 — recruit_applicants 컬럼과 1:1 이고 심사·집계 화면이 그 컬럼을 읽는다.
    바꿀 수 있는 것은 문구·안내·선택지·필수 여부뿐. 지망 팀도 여기 있고 `teams` 테이블(운영진 조직)과 별개다.
    옛 키(`essayIntroLabel` 등)(성별·지원경로·OT·면접방식 선택지,
    문항 2개). 미설정이면 `src/recruit/apply-form.ts` 의 기본값을 쓴다. 지망 팀 목록은 여기 두지 않고
    `teams` 테이블을 그대로 쓴다(회장단이 회원 관리에서 바꾸면 지원서도 따라간다).
    폐기 시 익명 집계만 archived_stats 로 잔존.
  - `recruit_slots` (id, cohort_id, starts_at, duration_min=20, link?, venue?, is_remote, created_by, created_at)
    — 면접 슬롯. cohort_id 인덱스(0014).
  - `recruit_slot_interviewers` (id, slot_id, user_id, created_at) UNIQUE(slot_id, user_id) — 슬롯별 면접관 배정(0014).
  - `recruit_duty_assignments` (id, cohort_id, starts_at, duty, user_id?(set null), note?, created_by, created_at)
    UNIQUE(cohort_id, starts_at, duty) — **면접 당일 대기실 업무 배정**(0019). 면접관이 아니라
    명단 체크·대기실 안내·인솔을 맡는 사람들. 업무 이름 목록은 `recruit_cohorts.duty_roles`(jsonb,
    미설정 시 `src/recruit/duty-rules.ts` 기본값). `duty = '__ALL__'` 은 그 시간대 전원 공지 줄로,
    `user_id` 대신 `note`('전원 면접실 정비')를 쓴다.
    ⚠ `starts_at` 은 `recruit_slots` 를 FK 로 걸지 **않는다** — 대기실 업무는 면접이 없는 시간대에도
    있고, 슬롯 하나를 지웠다고 그 시간의 대기실 배정까지 사라지면 안 된다. 시간축만 공유한다.
  - `recruit_applicants` (id, cohort_id, name, gender?, birth_date?(text), phone, school?, department?, email?,
    apply_route?, other_activities?, expected_frequency?, wish_team1?, wish_team2?, assigned_team?,
    **near_station?**(주소 대신 역명), ot_attend?(text), remote_interview_wish?(text), essay_intro?, essay_values?,
    **essay_values_topic?**(가치관 문항에서 고른 주제), **english_name?**(최종 합격자 로타랙트 가입 안내용),
    status, slot_id?, interview_link?, uploaded_by?(set null), created_at) — CSV 업로드 또는 온라인 접수.
    status = received→doc_fail|doc_pass→interview_done|interview_noshow
    →final_pass|final_fail. **phone·자기소개서 = PII, RAG 반입 금지(규칙 #5)·커밋/시드 금지(규칙 #4).**
  - `recruit_scores` (id, applicant_id, scorer_user_id, stage[document|interview], score numeric(3,1) 0~10 0.5단위,
    comment?, created_at, updated_at) UNIQUE(applicant_id, scorer_user_id, stage). 본인 점수만 수정. DB CHECK 로 범위 강제.
  - `recruit_memos` (id, applicant_id, author_user_id, content, updated_at) UNIQUE(applicant_id, author_user_id)
    — 지원자별 **개인** 메모(작성자당 1개). `screen_notes` (context_key PK, content, updated_by?, updated_at)
    — 화면별 **공용** 메모지. `recruit_mapping_presets` (id, name uq, mapping jsonb, created_by, updated_at) — CSV 매핑.
  - **상태 자동 전환**: 면접 점수 최초 저장 시 doc_pass→interview_done, 점수 0개로 감소 시 interview_done→doc_pass
    (같은 트랜잭션). 면접불참(interview_noshow)은 회장단 수동. 순수 함수 `nextStatusOnScoreChange` 로 분리(단위 테스트).
  - 조회 보호: 실패 메시지 단일화("입력 정보를 확인해주세요"), IP당 분당 5회 + 실패 10회 시 1시간 차단
    (`rate_limits` 재사용, 버킷 `recruit_lookup`/`recruit_lookup_fail`). **시도 입력값(이름·전화)은 저장하지 않는다**
    — 비지원자 PII 수집 금지(규칙 #4/#5). 결정 #8의 "시도 로그"는 카운터로 대체(07-DECISIONS 25).
  - RLS: 신규 8테이블 생성과 동시에 RLS 활성화(규칙 #8, RLS 테스트가 누락을 자동 감지).
  - ⚠ **`drizzle-kit push` 사용 금지**(0014 사고): push 는 schema.ts 에 RLS 선언이 없는 것을 보고
    **public 전 테이블의 RLS 를 꺼버린다**. 실제로 2026-07-27 전 28개 테이블 RLS 가 해제되어
    anon key 로 `users`·`memberships` 가 조회되는 상태였다. 스키마 변경은 반드시
    `npm run db:generate` → `npm run db:migrate`. 0014 가 RLS 를 일괄 복구했다.

## 접근 규칙 (서버에서 강제)
1. 쓰기 요청마다: 인증 → membership active? → 역할 충족? → 소유권(personal=본인,
   team=team_members 포함) 충족? → 통과 시 실행 + audit 기록.
2. 회장단/시스템관리자는 소유권 검사 우회 가능(단, audit에 override로 기록).
2-1. **게시판 게이트**(2026-07-24 보안 QA): 예약은 `boards` 에 등록 + `is_active` + `bot_can_write`
   인 게시판에만 만들 수 있고(`getWritableBoard`), **발행 직전에도 다시 확인**한다. 예약 뒤 권한이
   회수되면 게시하지 않고 `failed`(audit `post.blocked`) + 운영진 알림. 카페는 삭제 API 가 없어
   한번 나간 글을 되돌릴 수 없으므로 두 지점 모두에서 막는다.
   `boardMenuid` 는 요청 본문에서 오므로 FK(등록 여부)만으로는 부족하다 — 화면에서 목록을
   걸러 보여주는 것은 권한 검증이 아니다(규칙 #6).
3. `documents` 저장 시 PII 패턴(전화번호, 주민번호 형식, "계좌") 감지되면 경고 + pii_checked
   확인 요구.
4. 챗봇 검색 SQL: `WHERE visibility_rank <= 질문자_role_rank` 를 항상 포함.
   챗봇은 **로그인 사용자 전용**(비로그인 public 공개 없음, visibility 에 public 단계 추가 안 함).
   쿼터(결정 2026-07-23): **인당 일 30회** + **전역 분기 상한**(분기 예산 1만원 ÷ 모델 단가로 호출 수
   환산). 카운트는 chat_logs 기준. 상한값은 상수 하드코딩 금지 — 설정 테이블 값으로 두어 회장단이
   콘솔에서 수정. 전역 상한 도달 시: 챗봇만 비활성 + 안내 문구 표시 + 회장단 메일 알림.
   설계: `app_settings` (key, value_json, updated_by, updated_at) 같은 설정 테이블(챗봇 v1 착수 시 신설).

## 상태머신 요약

- **scheduled_posts**: `draft`(작성중) → `ready`(필수값 완성) → `scheduled`(발행 대기)
  → **`publishing`**(워커가 집어 감) → `published`(성공, cafe_article_url 기록) / `failed`(재시도 2회 후, 알림 발송)
  - `publishing` 은 **워커의 점유 표시**다. 크론이 매분 도는데 한 사이클은 건당 30초라, 이 상태가
    없으면 다음 워커가 아직 `scheduled` 인 글을 다시 집어 **같은 공지가 카페에 두 번** 올라간다
    (카페는 삭제 API 가 없어 되돌릴 수 없다). `updated_at` 이 점유 임차 시각이며 오래된 `publishing`
    은 워커가 죽은 것으로 보고 회수한다.
  - code 999(연속 등록 불가)는 **실패가 아니다** — `scheduled` 유지, `retry_count` 증가 없이 다음 사이클 재시도.
  - `failed` → `scheduled|draft` 로 운영진이 재시도 큐에 되돌릴 수 있다.

- **events(봉사 회차)**: enum 은 `draft → published → done | canceled` 4단계(마이그레이션 0002)이지만,
  **코드가 실제로 쓰는 값은 `draft`(생성 시 기본)와 `canceled`(예약 취소 시)뿐이다.**
  `published`·`done` 으로 전이시키는 코드가 없다(2026-07-28 확인).
  - 챗봇 노출 판정도 status 가 아니라 **"취소 아님 + 장소(place) 있음"** 으로 한다(07-DECISIONS 24).
    발행(카페 업로드)과 챗봇 안내는 별개 관심사라는 판단이었다.
  - 신청/확정 상태 없음(신청은 카페 댓글).

- **memberships**: `active` → `expired`. 전이 경로 3개 —
  ① **임기 만료(자동)**: 일일 크론이 `term_end < 오늘(KST)` 인 active 행을 `expired` 로 바꾸고
     `users.session_version` 을 올려 세션을 끊는다(`src/auth/term-expiry.ts`, 07-DECISIONS 47).
     마지막 날은 유효 — `term_end === 오늘` 은 만료가 아니다.
  ② **비활성화(수동)**: 회장단이 회원 관리에서 접근을 회수(복구 가능).
  ③ **탈퇴**: 되돌릴 수 없음 + 개인정보 삭제(07-DECISIONS 30).

- **학기 전환**: **미구현**(Phase 3). 설계는 "회장단 실행 → 유임 명단 외 일괄 expired → 새 학기
  가입코드 발급 → audit 묶음 기록". `invites` 는 `join_codes` 로 대체됐다(결정 2, 테이블은 0020 에서 DROP).
