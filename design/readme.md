# 애니멀메이트 (AnimalMate) 디자인 시스템

대학생 동물봉사 동아리 운영 자동화 웹서비스 **애니멀메이트**의 디자인 시스템.
핵심 기능: 정기 봉사 공지 예약 → 네이버 카페 자동 발행, 학기별 가입코드, 역할(부원/운영진/회장단) 기반 콘솔.
사용자 대부분이 스마트폰 접속 → **모바일 우선(360px)**, 데스크톱(≥1024px) 지원. React(Next.js) + Tailwind CSS 구현 전제.

## 소스
- 첨부 로고 2종: `assets/logo-emblem.jpg`(원형 엠블럼 — ANIMALMATE / ANIMAL PROTECT UNIVERSITY UNION, 파랑 원 + 코랄 강아지 + 앰버 고양이 + 크림), `assets/logo-shapes.png`(3D 젤리 형태의 추상 마크 3종 — 파랑/빨강/주황).
- 그 외 코드베이스·Figma 없음. 컴포넌트 인벤토리는 사용자의 요구 명세(2026-07 브리프)에서 정의됨.

## CONTENT FUNDAMENTALS (카피 톤)
- 한국어, **해요체**. 따뜻하고 친근하되 운영 도구답게 짧고 명료. 예: "예약이 저장됐어요", "아직 예약이 없어요. 첫 공지를 예약해 보세요."
- 오류는 원인 + 다음 행동: "코드가 맞지 않아요. 다시 확인해 주세요."
- 버튼 라벨은 동사형 명령 2~5자: "예약 생성", "완성 처리", "발급", "복사".
- 이모지는 사용하지 않음. 아이콘은 라인 아이콘으로만.
- 사용자 지칭 없음(주어 생략), 시스템은 1인칭 사용 안 함.

## VISUAL FOUNDATIONS
- **색**: 로고 추출 3원색 — 블루 `#5588D2`(primary, 신뢰/조작), 코랄 `#EE5A60`(위험/강조), 앰버 `#F0A72A`(대기/주의). 배경은 크림 `#FAF6EE`(따뜻함), 카드는 흰색. 중립색은 웜 그레이(ink). 화이트에 채도 얹은 크림 배경이 브랜드의 "따뜻함" 담당.
- **타이포**: Pretendard Variable 단일 서체(한국어 가독성). 굵은 700 제목 + 15px 본문, 행간 1.5~1.65. word-break: keep-all.
- **라운드**: 큼직하고 둥글게 — 입력/버튼 12px, 카드 16px, 모달 20px, 배지 pill.
- **그림자**: 웜톤(브라운 베이스) 저채도 그림자 3단(card/raised/modal). 테두리는 `--border-default`(웜 그레이) 1px + 그림자 병용.
- **배경**: 단색 크림. 그라데이션·패턴 없음(AI-slop 회피). 사진/일러스트는 실제 활동 사진 자리에 placeholder.
- **모션**: 150~200ms ease-out 페이드/이동만. 바운스 없음. 스피너·스켈레톤 셔머는 keyframes 제공(`am-spin`, `am-shimmer`, `am-toast-in`).
- **hover**: 한 단계 어두운 색(primary→600) 또는 surface-sunken. **press**: 두 단계 어두운 색, transform 없음. **focus**: 3px 블루 링(`--focus-ring`).
- **터치 타깃**: 최소 44px, 모바일 컨트롤 높이 48px.
- **레이아웃**: 모바일 360px 기준 16px 좌우 패딩, 단일 컬럼. 데스크톱은 max-width 960~1120px 중앙 정렬, 카드 그리드 2~3열. 상단 스티키 네비.
- **금지**: 보라-파랑 그라데이션, 이모지 카드, 좌측 컬러 보더 카드, 과한 유리모피즘.

## ICONOGRAPHY
- 단순한 24px 라인 아이콘(스트로크 1.8, round cap) — `components/display/Icon.jsx`에 서비스에 필요한 최소 세트를 내장(플러스, 닫기, 복사, 체크, 화살표, 달력, 시계, 사람, 링크, 메뉴, 로그아웃 등). Lucide 스타일과 호환되므로 코드 구현 시 lucide-react로 대체 가능.
- 이모지·유니코드 아이콘 사용 안 함. 로고 외 일러스트 없음.

## Tailwind 매핑
토큰명은 Tailwind config에 1:1로 옮길 수 있게 설계됨:
`--blue-500` → `theme.colors.blue.500`, `--radius-md` → `rounded-xl(12px)`, `--space-*` → 기본 spacing 스케일(4px 단위), `--control-h` → `h-12`, 폰트는 `font-sans`에 Pretendard 스택.

## 인덱스
- `styles.css` — 전역 진입점 (tokens/* @import)
- `tokens/` — colors, typography, layout(간격·radius·shadow), base(리셋·keyframes), fonts
- `assets/` — logo-emblem.jpg(원본), logo-emblem-circle.png(검정 테두리 제거·투명 원형), logo-shapes.png
- `guidelines/` — 파운데이션 스펙 카드
- `components/buttons/` — Button, IconButton, CountdownButton, CopyButton
- `components/forms/` — Field, Input, Textarea, Select, Checkbox, OtpInput, RepeatRows
- `components/display/` — StatusBadge, RoleBadge, Card, CodeChip, Icon
- `components/feedback/` — ConfirmDialog, Toast, Banner, EmptyState, Skeleton
- `components/navigation/` — NavBar, BottomTabs
- `ui_kits/console/` — 전 화면 시안. `index.html`은 12개 화면 + 역할/디바이스 토글 인터랙티브 시안. `home.html`은 홈 단독. 개별 화면 JSX: Auth, Home, Queue, ReservationForm, ReservationEdit, BulkCreate, Templates, Teams, JoinCode, Boards (+ Shell)

## 렌더링 노트
자체 완결형 HTML 킷(`ui_kits/console/index.html`, `home.html`)은 미리보기 환경이 `text/babel` 스크립트를 자동 실행하지 않아, 본문 끝의 부트스트랩 스크립트가 `#app`을 명시적으로 Babel 변환·실행해요. 새 단독 킷을 만들 때도 이 패턴을 유지하세요.

## Intentional additions
- `Icon` — 라인 아이콘 래퍼(브리프가 "단순한 라인 아이콘 권장"만 명시, 세트 미지정).
- `Field` — 라벨+힌트+오류 래퍼(브리프의 "라벨 + 힌트" 요구를 공통화).
