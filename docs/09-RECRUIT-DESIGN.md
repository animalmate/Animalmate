# 09. F9 신입 기수 모집 — 기술 설계·실행 계획

> 작성 2026-07-25. 스펙 원문 = 사용자 지시(작업 A). 이 문서는 **구현 착수 전 확정본**이다.
> 스키마·상태머신·권한·화면별 데이터 흐름·개인정보 처리·단계별 커밋을 못박는다.
> 코드와 이 문서가 어긋나면 **이 문서가 기준**이며, 바꾸려면 여기부터 고치고 같은 커밋에 반영한다.
> 관련: 03-DATA-MODEL(스키마 본체) · 07-DECISIONS(결정 24~) · 04-TODO(Phase 2 F9 체크리스트).

## 0. 범위와 원칙
- **v1 범위**: "지원자 데이터 업로드"부터 "최종 합격 발표 → 데이터 폐기"까지 전 과정을 사이트에서 처리.
  지원서 접수 폼 자체(구글폼 대체)는 **v2**(아래 백로그).
- **역할 분담(핵심 불변식)**: **채점은 운영진, 결정은 회장단.** 운영진은 합격 여부를 바꿀 수 없다.
  - 운영진(staff+): 지원서·자기소개서 열람, 서류 채점(0~10), 면접 채점(0~10), 개인 메모, 공용 메모지.
  - 회장단(board/sysadmin): 지원자 업로드, 집계 열람, 서류 합격 확정, 면접 배정, 최종 합격 확정,
    공개 스위치, CSV export, 데이터 폐기, 면접불참 표시.
- **개인정보 최소화(규칙 #4·#5 준수)**:
  1. 지원자 데이터·자기소개서는 **RAG 인덱스 반입 금지**. documents 파이프라인과 완전히 분리된 테이블.
  2. 열람은 운영진 이상. **CSV export·다운로드는 회장단만 + audit**.
  3. 모집 종료 시 cohort 단위 **일괄 hard delete**(2단계 확인, audit). 익명 집계만 잔존.
  4. **주소 전체는 저장하지 않는다** — "가장 가까운 역 명"(`near_station`)만 둔다.
  5. `/recruit` 비로그인 조회의 실패 시도는 **입력값(이름·전화)을 저장하지 않는다**(비지원자 PII 수집 금지).

## 1. 결정 번복 (07-DECISIONS 에 정식 기록)
- **결정 #7 번복**: 기존 F9 설계는 "phone_hash 만 저장, 원문 미저장"이었다. v1은 사이트에서 서류·면접
  심사를 **직접** 수행하므로 인적사항·자기소개서 전문이 필요하다 → **구글폼 전 필드를 원문 저장**한다.
  대신 (a) 주소는 역명으로 축소, (b) 열람 staff+/export board-only, (c) cohort hard delete 로 보관을 제한한다.
  조회 매칭은 원문 phone 이 이미 있으므로 **이름+전화 정확 일치**로 하고 별도 해시를 두지 않는다(결정 #7의
  해시 근거가 소멸). 조회 실패 시도는 값 저장 없이 IP 레이트리밋으로만 막는다.

## 2. 데이터 모델 (마이그레이션 0013, 03-DATA-MODEL 동기화)
enum:
- `recruit_status`: `received`(접수) → `doc_fail`(서류불합격) | `doc_pass`(서류합격) →
  `interview_done`(면접완료) | `interview_noshow`(면접불참) → `final_pass`(최종합격) | `final_fail`(최종불합격)
- `recruit_score_stage`: `document` | `interview`

테이블(전부 RLS 활성화, 정책 미부여 = 기본 거부. 접근은 서버 service role 경유):
- **`recruit_cohorts`** (id, label unique, `schedule_public` bool, `result_public` bool, `closed_at?`,
  `archived_stats?` jsonb, created_by, created_at)
  - 공개 스위치 2개가 여기 산다. 폐기 시 `closed_at` + `archived_stats`(익명 집계) 기록 후 하위 데이터 삭제.
- **`recruit_slots`** (id, cohort_id, `starts_at`, `duration_min` default 20, `link?`, created_by, created_at)
- **`recruit_applicants`** (id, cohort_id, name, gender?, birth_date?(text), **phone**(notNull),
  school?, department?, email?, apply_route?, other_activities?, expected_frequency?,
  wish_team1?, wish_team2?, **near_station?**, ot_attend?(text), remote_interview_wish?(text),
  essay_intro?, essay_values?, status default received, `slot_id?`, `interview_link?`, uploaded_by, created_at)
  - birth_date·ot_attend·remote_interview_wish 는 폼 표기가 제각각(예: "예/O/참석")이라 **원문 text**로 둔다.
  - phone 은 조회 매칭 키. PII — RAG·커밋·시드 금지.
- **`recruit_scores`** (id, applicant_id, scorer_user_id, stage, `score` numeric(3,1), comment?,
  created_at, updated_at) — **UNIQUE(applicant_id, scorer_user_id, stage)**. 본인 점수만 수정.
  - score 검증: 0.0~10.0, **0.5 단위**. 서비스에서 검증 + 마이그레이션 CHECK(`score>=0 AND score<=10 AND (score*2)=floor(score*2)`).
- **`recruit_memos`** (id, applicant_id, author_user_id, content default '', updated_at) —
  **UNIQUE(applicant_id, author_user_id)**. 지원자별 **개인** 메모(작성자당 1개). 면접 콘솔 자동 저장.
- **`screen_notes`** (context_key PK, content default '', updated_by?, updated_at) —
  화면별 **공용** 메모지. context_key 예: `recruit:doc`, `recruit:interview-assign`, `recruit:interview:<날짜>`.
- **`recruit_mapping_presets`** (id, name unique, `mapping` jsonb `{필드명: CSV헤더}`, created_by, updated_at) —
  CSV 열↔필드 매핑 프리셋. 매 기수 열 이름이 달라질 수 있어 저장·재사용.

관계: applicants.slot_id → slots(set null). scores/memos → applicants(cascade). 폐기 = cohort 삭제 →
slots·applicants cascade → scores·memos cascade. screen_notes·presets 는 cohort 독립(재사용) — 폐기 시 별도 처리.

## 3. 상태머신 (핵심 — 자동 전환)
```
received ──(회장단 서류확정)──▶ doc_pass 또는 doc_fail
doc_pass ──(운영진이 면접 점수 최초 저장)──▶ interview_done      [자동]
interview_done ──(그 지원자 면접 점수가 0개로 감소)──▶ doc_pass    [자동, 역방향]
doc_pass/interview_done ──(회장단 수동 '면접불참')──▶ interview_noshow
interview_done ──(회장단 최종확정)──▶ final_pass 또는 final_fail
```
- **면접완료는 버튼이 아니라 사실의 반영**: 면접 점수(stage=interview) 행이 1개 이상이면 interview_done,
  0개면 doc_pass 로 자동 복귀. 이 전이는 `recordInterviewScore`/`deleteScore` 서비스가 **같은 트랜잭션**에서 수행.
- **면접불참**(interview_noshow): 배정됐으나 면접을 못 본 사람을 회장단이 수동 표시. "면접 기록 없음"과 구분.
  - 상호작용 규칙: noshow 상태에서 나중에 면접 점수가 저장되면 **사실이 이김 → interview_done**으로 전환.
    (배정만 됐다가 실제로 면접을 본 경우.)
- **최종 결정 화면 경고**: `slot_id`가 있는데 면접 점수가 0개인 지원자(=interview_noshow 아님)를
  **"면접 기록 없음"**으로 강조 → 회장단이 누락을 눈으로 잡는다. noshow 는 기본 제외 대상으로 표시.

- **면접 점수칸은 비워 둔 채 시작한다**(기본값 없음, 2026-07-27 QA). 미입력이면 저장 버튼이 잠기고
  서버도 400 으로 거절한다. "채점 안 함"과 "8점 줌"은 다른 사실이고, 기본값이 들어 있으면 점수칸을
  건드리지 않은 저장이 실제 평가로 기록되면서 상태까지 interview_done 으로 전이된다 → 집계와
  표본 부족 판정이 함께 무너진다(07-DECISIONS 28).
- **일괄 상태 변경(bulk_status)은 `cohortId` 필수**. 지원자 id 만으로는 기수 범위가 걸리지 않아
  화면에서 고른 기수 밖의 지원자까지 확정될 수 있다. 제외 인원은 '단계 불일치'와 '기수 밖'을
  나눠 돌려준다(07-DECISIONS 29).

순수 함수로 분리(단위 테스트 필수):
- `nextStatusOnScoreChange(current, interviewScoreCount)` — 점수 수 변화 → 다음 상태(자동 전환/복귀만).
- `canConfirmDoc/Final(status)` 등 확정 가능 여부 가드.
- `canTransition(from, to)` — 회장단 수동 전이 가드. 서버 라우트에서 단건·일괄 모두 호출한다
  (화면에서 감추는 것은 검증이 아니다 — 규칙 #6).

## 4. 권한 (permissions.ts Action 추가)
- `{ kind: 'recruit.score' }` — **staff+**. 본인 점수·코멘트, 개인 메모, 공용 메모지 쓰기.
  (열람도 staff+ 이지만 authorize 는 쓰기 판단만 하므로, 읽기 라우트는 `isStaffPlus(actor.role)` 로 직접 게이트.)
- `{ kind: 'recruit.manage' }` — **board only**(isPrivileged). 업로드·기수 생성·서류/최종 확정·슬롯 배정·
  공개 스위치·면접불참·CSV export·폐기.
- audit: `recruit.manage` 는 관리 행위 → `isManagementAction` 에 추가(항상 audit). 채점/메모는
  도메인 서비스가 필요한 것만 audit(대량이라 전건 audit 는 노이즈 — 확정·폐기·export 만 남긴다).
- 서버 강제: 모든 recruit 라우트가 인증 + 역할 게이트. UI 숨김은 권한이 아니다(규칙 #6).

## 5. CSV 업로드·매핑 (회장단)
- 흐름: 파일 선택(.csv, UTF-8/EUC-KR 대응은 브라우저에서 텍스트로 읽어 전송) → 헤더 파싱 →
  **열↔필드 매핑 UI**(각 지원자 필드에 CSV 헤더 셀렉트) → 프리셋 저장/불러오기 →
  **미리보기**(상위 N행 + 매핑 결과) → **중복 감지**(이름+전화 동일 = 경고, 기본 skip/덮어쓰기 선택) → 확정 업로드.
- 파싱은 서버(`src/recruit/csv.ts`, 순수): 따옴표·개행 포함 CSV 안전 파서 + 헤더 매핑 적용 + 중복 판정.
  자기소개서에 쉼표·줄바꿈이 많아 **정규식 split 금지**, 상태 기반 파서로 작성(단위 테스트 필수).
- `near_station`: 매핑 대상은 "가까운 역" 필드. 이번 기수 폼이 전체 주소를 받았다면, 미리보기에서
  전체 주소로 보이는 값(시/구/동/번지 패턴)에 **경고 배지**를 띄우고, 업로드 후 심사 화면에서 인라인으로
  역명만 남기도록 안내한다. (자동 축약은 신뢰 불가 → 사람이 정리. 04-TODO 질문에 대안 기록.)
- 매핑 프리셋은 global(회장단 관리, 이름으로 재사용). value = `{applicantField: csvHeader}`.

## 6. 화면별 설계 (데이터 흐름)
1. **서류 심사 `/recruit/screening`** (staff+): 좌 지원자 목록(내 채점 여부·평균 배지, 정렬=미채점/이름/평균),
   우 패널(인적사항 요약 + 자기소개서 2문항 전문 + 내 점수·코멘트 입력 + 타 운영진 점수·코멘트 이름과 함께).
   "다음 지원자" 버튼 없음 — 목록 클릭으로 우 패널 교체. 공용 메모지(context `recruit:doc`) 팝업 버튼.
2. **서류 집계·확정 `/recruit/tally`** (board): 평균 내림차순 표(이름·학교·희망팀·평균·채점자 수·최고/최저·
   코멘트 펼치기). **채점자 3명 미만 "표본 부족" 강조.** 체크박스 서류 합격 확정(일괄 상태 변경 + audit).
   "상위 N명 자동 체크" 보조(최종은 사람 확정).
3. **면접 배정 `/recruit/interview/assign`** (board): 서류 합격자 대상. 슬롯 생성(날짜·시간, 기본 20분,
   조정 가능). 지원자→슬롯 배정(셀렉트). 링크=슬롯 단위 또는 개인 단위. **비대면 면접 희망 값 표시.**
   배정 보드(날짜×시간 격자, 미배정자 강조). 공용 메모지(context `recruit:interview-assign`).
4. **면접 당일 콘솔 `/recruit/interview/console`** (staff+, **실사용 핵심**): 날짜 선택 → 시간순 대상자,
   현재 시간대 강조. 지원자 선택 시 한 화면: 좌(자기소개서 2문항 + 인적사항) / 우상(내 개인 메모, 자동 저장) /
   우하(면접 점수 + 코멘트 + 타 운영진 면접 점수·코멘트). 자동 저장(디바운스)+저장 상태 표시, 새로고침 유지.
   노트북·태블릿 좌우 분할, 모바일 탭 전환. 공용 메모지(context `recruit:interview:<날짜>`).
   → **면접 점수 최초 저장 = interview_done 자동 전환**(3장).
5. **최종 결정 `/recruit/final`** (board): 면접 평균 내림차순 + 서류 평균 **병기**(합산·가중치 **계산 안 함**).
   코멘트·메모 펼치기. 체크박스 최종 합격 확정 + audit. **"면접 기록 없음" 경고 + noshow 기본 제외 표시.**
6. **공용 메모지**(screen 6): 각 화면당 1개(context_key 구분). 운영진 누구나 함께 쓰고 지움. 자동 저장,
   마지막 수정자·시각 표시. 접기/펼치기(기본 접힘). 개인 메모(recruit_memos)와 별개. 공용 컴포넌트로 구현.
7. **지원자 조회 `/recruit`** (비로그인): 이름+전화 전체 입력, **정확 일치 시에만** 본인 상태 표시.
   표시 = 현재 상태 / 면접 일시·링크(schedule_public ON) / 최종 결과(result_public ON).
   하단 + 결과 화면에 고지: "지원 정보는 선발 목적으로만 이용하며, 모집 절차가 끝나는 즉시 모두 폐기합니다."
   **독립 레이아웃(앱 링크 없음), `noindex`, 실패 메시지 단일화**("입력 정보를 확인해주세요"),
   **IP당 분당 5회 + 실패 10회 시 1시간 차단**(rate_limits 재사용, 입력값 미저장).
   공개 스위치 2개는 회장단만 조작. 결과 공개 시 **"○명 합격 / ○명 불합격이 공개됩니다" 확인 단계**.

## 7. 조회 보호 (rate_limits 재사용, 신규 로그 테이블 없음)
- 버킷 2개: `recruit_lookup`(IP, 5회/분) = 무차별 대입 속도 제한 / `recruit_lookup_fail`(IP, 10회/시간)
  = 실패 누적 시 1시간 차단. 성공 시 fail 버킷 reset.
- **시도 내용(이름·전화)은 저장하지 않는다** — 비지원자의 PII 를 수집하게 되어 규칙 #4/#5 위반.
  결정 #8의 "시도 로그"는 감사 목적이나, 매칭 실패 입력은 곧 임의의 개인정보라 카운터만 남긴다(07-DECISIONS 기록).

## 8. 폐기 (회장단, 되돌릴 수 없음)
- 2단계 확인(모달 + 라벨 재입력). 실행 = `archived_stats` 계산(지원자 수·서류합격·최종합격·평균 서류/면접 점수,
  전부 익명 수치) → cohort.closed_at·archived_stats 기록 → applicants delete(cascade 로 slots/scores/memos 동반).
  mapping_presets 는 재사용 자산이라 유지. 공용 메모지는 키가 `recruit:{cohortId}:{화면}:{팀}` 이라
  기수 단위로 전량 삭제한다(운영진이 메모지에 지원자 실명을 적으므로, 남기면 "모두 폐기" 고지를 어긴다).
- 재폐기 차단: `archived_stats` 가 이미 있으면 409. 두 번 실행하면 지원자가 0명이라 집계가 0 으로 덮여
  폐기 후 유일하게 남는 기록이 사라진다. 없는 기수도 409(조용한 성공 금지).
- 확인 모달에 **대상 기수·인원**을 표시하고 확인 문구는 매번 새로 입력받는다(닫을 때 비운다).
- audit `recruit.purge` [high]. 확인 단계에서 "복구 불가" 명시. 04-TODO 파일럿 체크리스트에 "모집 종료 후 폐기" 추가.

## 9. RLS·테스트
- 신규 7테이블 전부 마이그레이션에서 RLS ON(rls.security.test 가 동적 수집으로 자동 커버).
- 단위 테스트(순수): 상태 전이(자동 면접완료·복귀·noshow), CSV 파서·매핑·중복 감지, score 검증(0.5 단위),
  집계(평균/최고/최저/표본부족), 조회 매칭(정확 일치·정규화), 권한(recruit.score staff+ / recruit.manage board).
- 통합 테스트(실 DB): 운영진 채점→interview_done 자동 전환 / 점수 삭제→복귀 / 회장단만 확정·export·폐기 /
  비로그인 조회 공개 스위치 OFF 시 미노출 / 폐기 후 지원자 0행 + archived_stats 존재.
- E2E 성격의 화면은 사용자 시각 검증(에이전트 크롬 미연결 — 기존 한계).

## 10. 단계별 커밋 (= push)
- **1a**: 마이그레이션 0013 + schema.ts + 03-DATA-MODEL + permissions Action + permissions.test. (이 커밋)
- **1b**: `src/recruit/*` 서비스(cohorts·csv·applicants·scores(상태전이)·memos·notes·aggregate·lookup·purge) + 단위테스트.
- **2**: API 라우트(`/api/recruit/*`) + 업로드·매핑 UI(회장단).
- **3**: 서류 심사 화면 + 공용 메모지 컴포넌트.
- **4**: 서류 집계·확정 + 면접 배정.
- **5**: 면접 당일 콘솔(자동 저장).
- **6**: 최종 결정 + 공개 스위치 + 폐기.
- **7**: `/recruit` 비로그인 조회 + nav/home + 04-TODO 체크리스트 + 07-DECISIONS 정식화.

## 11. v2 백로그
- ~~모집 공고 페이지 / 지원서 접수 폼~~ → **v1 에 구현됨**(`/recruit/notice`, `/recruit/apply`).
  문항·선택지는 하드코딩이 아니라 "0. 공고 설정"에서 기수마다 수정한다(`recruit_cohorts.apply_form`).
  33기까지는 구글폼 병행이라 업로드 화면이 남아 있고, 34기부터 이 폼으로 일원화 예정.
- 남은 항목: 지원자 메일 알림.

---

# 작업 B. 사이트 활용 가이드 3종 — ✅ 완료(2026-07-28)
> 결과물: 원문 `src/guides/content.ts`(단일 출처) → `docs/08-USER-GUIDES.md` 는
> `node scripts/build-guides-doc.mjs` 로 **생성**한다(화면과 문서가 갈라지지 않게).
> 화면 `/guides` + 홈 "사용 가이드" 카드 + 상단 메뉴 "가이드". 역할별 노출은 **서버에서 필터**해
> 부원의 HTML 에 운영진용 본문이 실려 나가지 않는다(규칙 #6).
> ※ "documents 와 같은 방식으로 회장단이 편집"은 채택하지 않았다 — 누군가 붙여 넣기 전까지 가이드가
> 비어 있게 되고, 챗봇 지식베이스에 섞이면 공개 범위 관리가 이중이 된다. 문구 수정은 커밋으로 한다.

## (원래 계획)
- 저장: documents 와 같은 방식(회장단이 편집)으로 관리하되 **초안은 에이전트가 작성**. 원문은 `docs/08-USER-GUIDES.md` 보관.
- 노출: 홈 "사용 가이드" 버튼. 역할별(부원=부원용 / 운영진=부원+운영진 / 회장단=3종 전체).
- 작성 원칙: 한 문장=한 동작, 전문용어 금지(임베딩→"챗봇이 읽는 자료" 등), 항목마다 "무엇을/어디서/언제",
  메뉴 이름은 실제 UI 문구 그대로, 경로는 "홈 → 예약 → 새 예약" 표기, 각 가이드 맨 위 "이것만 알면 됩니다" 3줄.
- 구성: ①부원용(1화면) ②운영진용 ③회장단용(시기별 체크리스트 — 학기 시작/학기 중/신입 모집/회장단 교체 + 문제 대응).
- 산출: 가이드 3종 마크다운 + docs/08 + 홈 버튼/역할 노출 구현 + 회장단용을 05-ASSET-REGISTRY·07-DECISIONS 와 대조 후 보고.
- **F9 완료 후 착수**(회장단 가이드가 F9 실제 UI 문구·흐름을 참조).
