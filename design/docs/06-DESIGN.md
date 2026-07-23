# 애니멀메이트 — 코딩 에이전트 핸드오프 (docs/06-DESIGN.md)

이 문서 하나로 React(Next.js App Router) + Tailwind 구현에 필요한 디자인 규칙을 모두 담았어요.
**바이브코딩 에이전트에게 이 폴더(디자인 시스템 전체)를 첨부하고, 아래 "에이전트 지시문"을 복사해 붙여넣으세요.**

---

## 0. 에이전트 지시문 (복사해서 그대로 전달)

> 첨부한 `애니멀메이트 디자인 시스템`을 우리 코드베이스에 적용해줘. 규칙:
> 1. `handoff/tailwind.config.js` 를 프로젝트 `tailwind.config.js` 에 병합. `handoff/globals.css` 를 `app/globals.css` 로 사용(폰트·상태색 변수·접근성 포함).
> 2. UI는 `ui_kits/console/` 의 화면 시안과 `components/` 의 컴포넌트를 **정확히 재현**. 임의로 색·라운드·간격을 바꾸지 말 것. 값이 애매하면 이 문서의 토큰 표를 따를 것.
> 3. 아이콘은 `components/display/Icon.jsx` 의 세트를 쓰되, 프로덕션에선 동일 모양의 **lucide-react** 로 대체 가능(스트로크 1.8, round cap).
> 4. 컴포넌트 props/동작은 각 `*.d.ts` 와 `*.prompt.md` 를 따를 것.
> 5. 한국어 카피는 **해요체**, 이모지 없음. 새 문구는 이 문서 "카피 규칙"을 따를 것.
> 6. 모바일 우선(360px), 터치 타깃 44px+, 대비 AA, 포커스 링·라벨 필수.
> 화면별 상호작용은 `ui_kits/console/index.html` 을 브라우저로 열어 클릭하며 확인해줘(역할·디바이스 토글 포함).

---

## 1. 디자인 토큰

### 색 (HEX)
| 역할 | 토큰 | HEX |
|---|---|---|
| Primary(조작·신뢰) | blue-500 | `#5588D2` |
| Primary hover / active | blue-600 / blue-700 | `#3E6FB9` / `#345C99` |
| 위험·강조(삭제/취소) | coral-500 / 600 | `#EE5A60` / `#D8434B` |
| 대기·주의 | amber-500 / 600 | `#F0A72A` / `#C97F0A` |
| 페이지 배경 | cream-50 | `#FAF6EE` |
| 카드 배경 | white | `#FFFFFF` |
| 가라앉은 면 | cream-100 | `#F4EDDF` |
| 테두리 | ink-200 | `#DDD6C8` |
| 본문 텍스트 | ink-700 | `#4E4739` |
| 제목 텍스트 | ink-900 | `#2E2921` |
| 보조 텍스트 | ink-500 | `#7B7263` |
| 성공 | success / -100 / -700 | `#2F8A57` / `#DFF2E6` / `#226A42` |
| 경고 | warning / -100 / -700 | `#C97F0A` / `#FAEBC8` / `#8F5C05` |
| 오류 | error / -100 / -700 | `#D8434B` / `#FDE3E4` / `#B23239` |
| 정보 | info / -100 / -700 | `#3E6FB9` / `#DFEAF8` / `#2C4B7C` |

### 예약 상태 배지 5종
`작성중`(ink-100/500) · `완성`(blue-100/700) · `발행 대기`(amber-100/700) · `발행됨`(success) · `실패`(coral). → CSS 변수 `--status-*` (globals.css).

### 타이포 (Pretendard Variable)
| 이름 | weight / size / line | 용도 | Tailwind |
|---|---|---|---|
| display | 700 / 28px / 1.35 | 페이지 타이틀 | `text-[28px] font-bold` |
| h1 | 700 / 22px / 1.4 | 화면 제목 | `text-[22px] font-bold` |
| h2 | 700 / 18px / 1.45 | 섹션 | `text-lg font-bold` |
| h3 | 600 / 16px / 1.5 | 카드 제목 | `text-base font-semibold` |
| body | 400 / 15px / 1.6 | 기본 본문 | `text-[15px]` |
| caption | 400 / 13px / 1.5 | 힌트 | `text-[13px]` |
| label | 600 / 14px / 1.4 | 폼 라벨 | `text-sm font-semibold` |
| badge | 600 / 12px | 배지 | `text-xs font-semibold` |
> 한국어 가독성: `word-break: keep-all`, 행간 1.5~1.65.

### 간격 / 라운드 / 그림자 / 크기
- 간격: 4px 스케일 (Tailwind 기본 `p-1`=4px … `p-6`=24px).
- 라운드: 배지·칩 `rounded-lg`(8) · 입력·버튼 `rounded-xl`(12) · 카드 `rounded-2xl`(16) · 모달 `rounded-[20px]`.
- 그림자: `shadow-card`(카드) · `shadow-raised`(호버/토스트) · `shadow-modal`(다이얼로그).
- 컨트롤 높이: 모바일 `h-control`(48) · 보조 `h-control-sm`(36) · 최소 터치 `min-h-tap`(44).

---

## 2. 컴포넌트 인벤토리 (경로 = 구현 소스)
- **buttons/** — Button(primary·secondary·destructive·text / md·sm / loading·disabled·icon·block), IconButton, CountdownButton(재전송 60s), CopyButton.
- **forms/** — Field(라벨+힌트+오류), Input(text·email·number·date·time·datetime-local), Textarea, Select, Checkbox, OtpInput(6자리·붙여넣기), RepeatRows(행 추가/삭제 — 발행 일정·팀장단).
- **display/** — StatusBadge(5종), RoleBadge(부원·운영진·회장단·관리자), Card, CodeChip(`{{간결_날짜}}` 등), Icon(라인 세트).
- **feedback/** — ConfirmDialog(취소·삭제·재발급 등 danger), Toast(성공·오류·정보), Banner(스팸함·미완성·삭제불가), EmptyState, Skeleton.
- **navigation/** — NavBar(역할별 메뉴·역할 배지·로그아웃, 모바일=햄버거 드로어).

각 컴포넌트의 props는 동일 폴더 `*.d.ts`, 사용 예시는 `*.prompt.md` 참고.

## 3. 화면 (ui_kits/console/)
Auth(로그인·가입 2단계), Home(역할별 바로가기), Queue(예약 큐), ReservationForm(새 예약), ReservationEdit(수정/발행됨), BulkCreate(일괄 생성), Templates, Teams(조직·팀장단), JoinCode(가입코드), Boards(게시판). 각각 데스크톱/모바일 대응.
- 권한: 부원=홈만 / 운영진=+예약·템플릿·일괄 / 회장단·관리자=+조직·가입코드·게시판.
- `index.html` = 전 화면 클릭 데모(역할·디바이스 토글). `home.html` = 홈 단독.

## 4. 카피 규칙
- 해요체, 따뜻하되 짧고 명료. 버튼은 동사형 2~5자("예약 생성","완성 처리","발급").
- 오류는 원인+행동: "코드가 맞지 않아요. 다시 확인해 주세요."
- 이모지·주어("당신") 없음. 시스템 1인칭 없음.

## 5. 접근성
대비 AA, 모든 입력에 `<label>`+`htmlFor`, `:focus-visible` 파란 3px 링, 터치 타깃 44px+, 상태는 색+텍스트(배지에 점+글자) 병행.

## 6. 자산
`assets/logo-emblem-circle.png`(검정 테두리 제거·투명 원형 — **UI에는 이걸 사용**), `assets/logo-emblem.jpg`(원본 사각), `assets/logo-shapes.png`(장식용 젤리 마크). 로고를 직접 다시 그리지 말 것.

## 7. 장식: 커서 따라다니는 강아지 (`src/components/cursor-dog.tsx`)
로그인·가입·홈(전 역할)에만 붙는 장식용 강아지. 운영진 콘솔·예약 큐 등 작업 화면엔 넣지 않는다.
- **구현**: 단일 클라이언트 컴포넌트, SVG + `requestAnimationFrame`만(외부 라이브러리·캔버스 금지). 뷰포트 하단을 지면 삼아 커서 X를 좌우로 추종, 커서 Y로 상태(idle·run·jump·lookup·reach) 전환.
- **가드레일(수정 시 유지)**: `@media (pointer:fine)`에서만 마운트(터치 기기는 토글조차 없음), `prefers-reduced-motion:reduce`면 루프 정지·정지 배치, 컨테이너 `pointer-events:none`+`z-index:-1`(콘텐츠 아래), `transform` 속성만 조작, 탭 비활성 시 rAF 정지. 색상은 하드코딩(테마 토큰으로 치환 금지 — 다크모드에서도 동일).
- **토글**: 우측 하단 🐾 버튼, `localStorage['am:cursor-dog']` 저장, 기본 on.
- **주의**: `z-index:-1`이 콘텐츠 아래에 보이려면 상위에 불투명 배경이 없어야 한다. 이 때문에 `ConsoleShell` 루트의 중복 `bg-cream-50`을 제거하고 배경을 `body`(globals)로 일원화했다. 홈에 장식을 붙이는 전제이므로 되돌리지 말 것.
- `/recruit`(미구현)에도 대상. 생기면 `<CursorDog />` 한 줄만 추가하면 된다.
