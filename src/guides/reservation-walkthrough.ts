/**
 * 예약 흐름 둘러보기 — 예약 큐에서 뜨는 **스크린샷 슬라이드**의 원문과 표시 규칙.
 *
 * 왜 도움말(`content.ts`)과 따로인가: 저것은 "이 화면에서 무엇을 하는가"를 글로 적은 것이고,
 * 이것은 **처음 맡은 사람에게 전 과정을 한 번 보여주는 것**이다. 예약은 화면 세 곳(큐 → 새 예약 →
 * 큐 → 카톡 앱)을 오가는 일이라, 어느 한 화면의 글로는 "다음에 어디로 가는지"가 안 보인다.
 * 글이 아니라 **실제 화면**이어야 하는 이유도 그것이다 — 처음 보는 사람은 버튼 이름을 들어도
 * 그게 화면 어디에 있는지 모른다.
 *
 * 작성 규칙은 `content.ts` 와 같다:
 *  - 하는 법만. 왜 그렇게 만들었는지는 07-DECISIONS 의 몫이다.
 *  - 화면을 보면 아는 것은 적지 않는다(그림이 이미 말하고 있다). 글은 **그림이 말하지 못하는 것**만.
 *  - 되돌릴 수 없는 것은 반드시 남긴다.
 *  - 버튼 이름은 화면에 실제로 적힌 문구 그대로.
 *
 * ⚠ `image` 는 `public/help/reservations/` 아래 파일 이름이다. 이 캡처들은 사람이 찍지 않는다 —
 *   `node scripts/capture-help-shots.mjs` 가 **테스트 DB의 가짜 데이터**로 띄운 화면을 찍는다.
 *   운영 화면을 찍으면 실제 예약 제목·팀명·작성자가 그대로 커밋된다(.gitignore 의 경고 참고).
 *   UI 를 바꿨으면 스크립트를 다시 돌린다.
 */

/**
 * 한 단계에 붙는 그림. **PC 와 휴대폰을 나란히** 놓는다(사용자 지시 2026-08-06).
 *
 * 왜 둘 다인가: 팀장단은 공지를 PC 로 걸어 두고 단톡 예약은 폰으로 하는 식으로 **기기를 섞어 쓴다.**
 * 한쪽만 보여주면 다른 기기를 쓰는 사람은 "내 화면은 왜 이렇게 안 생겼지"에서 멈춘다.
 * 특히 카카오톡은 PC 와 폰의 메뉴 생김새가 아예 다르다.
 *
 * 파일 이름을 키에서 만들지 않고 그대로 적는 이유: 카카오톡 앱 화면은 우리가 찍을 수 없어
 * 사람이 찍어 준 것을 쓴다(확장자가 jpg 다). 자동 캡처분과 규칙을 억지로 맞추면 한쪽이 깨진다.
 */
export interface WalkShots {
  /** `public/help/reservations/` 아래 파일 이름. 없으면 그 칸은 그리지 않는다. */
  pc?: string;
  mobile?: string;
}

export interface WalkStep {
  /** 캡처 파일 이름의 뿌리. 순서가 바뀌어도 파일은 이 키를 따라간다. */
  key: string;
  title: string;
  /** 두세 문장. 그림이 말하지 못하는 것만 적는다. */
  body: string;
  shots: WalkShots;
  /** 그림이 하나도 없을 때 그 자리에 들어갈 한 줄. */
  pending?: string;
}

export const WALK_STEPS: WalkStep[] = [
  {
    key: 'queue',
    title: '예약 큐에서 시작합니다',
    body: '여기 있는 예약은 **적어 둔 시각이 되면 카페에 저절로 올라갑니다.** 그때까지는 언제든 고칠 수 있어요. 딱지가 `업로드 대기`면 준비가 끝난 것입니다.',
    shots: { pc: 'queue.pc.png', mobile: 'queue.mobile.png' },
  },
  {
    key: 'new-button',
    title: '새 예약을 누릅니다',
    body: '오른쪽 위 **새 예약**. 봉사 공지도 일반 공지도 모두 이 버튼에서 시작합니다.',
    shots: { pc: 'new-button.pc.png', mobile: 'new-button.mobile.png' },
  },
  {
    key: 'kind',
    title: '종류를 고릅니다',
    body: '**봉사 공지**를 고르면 아래에 봉사 일자·장소·정원 칸이 생깁니다. 총회 같은 일반 공지는 **일반 공지**로 두세요.',
    shots: { pc: 'kind.pc.png', mobile: 'kind.mobile.png' },
  },
  {
    key: 'template',
    title: '양식을 불러옵니다',
    body: '**양식 불러오기**에서 팀 양식을 고르면 제목·본문과 함께 **기본 장소·정원까지** 채워집니다. 매번 처음부터 쓰지 않아도 됩니다.',
    shots: { pc: 'template.pc.png', mobile: 'template.mobile.png' },
  },
  // 팀장단에게 물어보니 **여기가 실제로 제일 자주 틀리는 지점**이었다(2026-08-06 사용자 보고):
  // `{{ }}` 가 저절로 바뀌는 줄 모르고 지운 뒤 날짜를 직접 적는다. 그 회차에는 맞아 보이므로
  // 아무도 이상한 줄 모르고 넘어가고, 다음 회차에서 지난 날짜가 그대로 카페에 올라간다.
  // 화면(PlaceholderGuide)은 이미 설명하고 있으니, 여기서는 **왜 그러면 안 되는지**를 못 박는다.
  {
    key: 'placeholders',
    title: '{{ }} 는 지우지 마세요 — 제일 자주 나는 실수',
    body: '중괄호 표시는 **손대지 않고 그대로 두면** 카페에 올라가는 순간 진짜 값으로 바뀝니다.\n\n지우고 날짜를 직접 적으면 그 회차에는 맞아 보이지만, 같은 글로 다음 회차를 만들 때 **지난 날짜가 그대로 올라갑니다.** 카페 글은 **고칠 수도 지울 수도 없습니다.**\n\n무엇으로 바뀌는지는 예약 큐 카드의 **업로드할 때 이렇게 바뀝니다**에서 미리 확인할 수 있어요. 장소처럼 늘 같은 내용은 표시 없이 그냥 적으면 됩니다.',
    shots: { pc: 'placeholders.pc.png', mobile: 'placeholders.mobile.png' },
  },
  {
    key: 'rows',
    title: '회차를 채웁니다',
    body: '**봉사 일자**를 넣으면 업로드 날짜·시각이 자동으로 잡힙니다(봉사 7일 전 저녁 8시). 회차가 여러 번이면 **+ 일정 추가**로 줄을 늘리세요 — 회차마다 날짜·집합 시간·정원을 따로 적을 수 있습니다.',
    shots: { pc: 'rows.pc.png', mobile: 'rows.mobile.png' },
  },
  {
    key: 'preview',
    title: '올라갈 글을 눈으로 확인합니다',
    body: '**미리보기**는 `{{장소}}` 같은 자리를 실제 값으로 바꿔 보여줍니다. **카페에 올라간 글은 고칠 수도 지울 수도 없으니** 여기서 한 번 읽고 저장하세요.',
    shots: { pc: 'preview.pc.png', mobile: 'preview.mobile.png' },
  },
  {
    key: 'queue-after',
    title: '큐로 돌아와 상태를 봅니다',
    body: '`업로드 대기`면 손댈 일이 없습니다. 카드에 **미완성: 장소** 처럼 적혀 있으면 그대로는 **올라가지 않습니다** — 적힌 항목을 **수정**에서 채우세요.',
    shots: { pc: 'queue-after.pc.png', mobile: 'queue-after.mobile.png' },
  },
  {
    key: 'kakao-notice',
    title: '단톡방 공지문을 받습니다',
    body: '**카카오톡 공지 예약**을 누르면 보낼 문구와 **예약할 시간**(카페에 올라간 1분 뒤)이 나옵니다. **공지문 복사**를 누르세요.',
    shots: { pc: 'kakao-notice.pc.png', mobile: 'kakao-notice.mobile.png' },
  },
  // 아래 두 장은 카카오톡 앱 화면이라 우리가 찍을 수 없다 — 사람이 찍어 준 것을 쓴다(2026-08-06).
  {
    key: 'kakao-open',
    title: '카카오톡에서 예약 메시지를 엽니다',
    body: '단톡방 입력창 왼쪽 **＋** 를 누르면 나옵니다. PC 는 **메시지 예약**, 휴대폰은 **예약메시지** 로 이름이 조금 다릅니다.',
    shots: { pc: 'kakao-open.pc.png', mobile: 'kakao-open.mobile.jpg' },
  },
  {
    key: 'kakao-send',
    title: '붙여 넣고 시간을 맞춰 예약합니다',
    body: '복사한 공지문을 붙여 넣고, 예약 큐에서 본 **예약 시간**과 **보낼 단톡방**이 맞는지 확인한 뒤 **예약**을 누릅니다.\n\n**보내는 것은 사람이 합니다** — 시스템은 카톡으로 대신 보내지 못합니다. 예약을 걸어 둔 뒤 업로드 시각을 바꿨다면 **카톡에 걸어 둔 예약도 함께 고쳐야** 합니다.',
    shots: { pc: 'kakao-send.pc.png', mobile: 'kakao-send.mobile.jpg' },
  },
];

const SHOT_DIR = '/help/reservations';

/** 파일 이름 → 화면이 부를 주소. */
export function shotPath(file: string): string {
  return `${SHOT_DIR}/${file}`;
}

/** 자동 캡처가 쓰는 파일 이름 규칙. 캡처 스크립트와 화면이 같은 규칙을 봐야 짝이 맞는다. */
export function autoShotFile(key: string, device: 'pc' | 'mobile'): string {
  return `${key}.${device}.png`;
}

// ── 언제 저절로 뜨는가 ────────────────────────────────────────────────────
//
// 세 가지가 서로 다른 이야기라 저장하는 곳도 다르다:
//  - **하루 동안 보지 않기** = 하루짜리 약속 → localStorage(브라우저를 닫아도 남는다)
//  - **그냥 닫기** = "지금은 됐다" → sessionStorage(탭을 닫으면 잊는다). 큐를 들락거릴 때마다
//    다시 뜨면 그게 제일 성가시다.
//  - **다시 보고 싶다** → 언제든 `예약 흐름 보기` 버튼. 스누즈 중에도 눌러서 열 수 있다.
//
// DB 에 두지 않는 이유: 이 값은 성가심을 줄이는 장치일 뿐 감사 대상이 아니다. 기기를 바꾸면
// 다시 뜨는 쪽이 **안전한 실패**이기도 하다(그 기기에서는 아직 안 본 사람일 수 있다).

export const SNOOZE_KEY = 'am.help.reservations.snoozedUntil';
export const SESSION_KEY = 'am.help.reservations.closedThisSession';
export const SNOOZE_MS = 24 * 60 * 60 * 1000;

/** 저장된 값 읽기. 숫자가 아니거나 이미 지난 값은 없는 것으로 본다. */
export function parseSnoozedUntil(raw: string | null, now: number): number | null {
  if (!raw) return null;
  const t = Number(raw);
  if (!Number.isFinite(t) || t <= now) return null;
  return t;
}

export function snoozeUntilFrom(now: number): number {
  return now + SNOOZE_MS;
}

/**
 * 큐에 들어왔을 때 저절로 열 것인가.
 * 하루 스누즈가 살아 있거나 이 세션에서 이미 닫았으면 열지 않는다.
 */
export function shouldAutoOpen(opts: {
  now: number;
  snoozedUntilRaw: string | null;
  closedThisSession: boolean;
}): boolean {
  if (opts.closedThisSession) return false;
  return parseSnoozedUntil(opts.snoozedUntilRaw, opts.now) === null;
}

/** 남은 스누즈를 사람 말로. 버튼 옆에 "내일 다시 보여드려요" 처럼 적는다. */
export function snoozeRemainingLabel(snoozedUntil: number | null, now: number): string | null {
  if (snoozedUntil === null || snoozedUntil <= now) return null;
  const hours = Math.ceil((snoozedUntil - now) / (60 * 60 * 1000));
  return `${hours}시간 뒤에 다시 보여드려요`;
}
