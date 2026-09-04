// F9 결과 안내 메일 — 순수 규칙(부수효과·DB 접근 없음).
//
// 메일은 되돌릴 수 없고 한 번에 200통이 나간다. 그래서 "누구에게 / 언제 / 몇 통" 을 정하는 판단은
// 전부 여기 순수 함수로 빼서 단위 테스트로 고정한다(CLAUDE.md 코드 컨벤션 — 권한·필터는 테스트 필수).
//
// ⚠ **메일에 당락을 쓰지 않는다.** 본문은 "결과가 나왔으니 홈페이지에서 확인해 주세요" 까지다.
//   메일은 오배송·전달·스크린샷으로 새기 쉬운 채널이고, 당락은 본인만 봐야 한다. 조회 화면은
//   이름+전화번호를 맞혀야 열리므로(lookup.ts) 확인 경로로 훨씬 안전하다.

import type { RecruitStatus } from './status';
import { isValidEmail } from '../lib/email';

export type ResultMailStage = 'document' | 'interview' | 'final';

export const RESULT_MAIL_STAGES: readonly ResultMailStage[] = ['document', 'interview', 'final'];

/**
 * ⚠ `document` 는 **서류 결과와 면접 일정을 함께** 안내한다(2026-09-04).
 *
 * 두 가지가 애초에 한 번에 발표되기 때문이다 — 공개 스위치가 `schedule_public` 하나뿐이라
 * 따로 발표하는 것이 불가능하고(`lookup-visibility.ts`), 그런데도 메일만 두 통으로 갈라져
 * **서류합격 + 슬롯 배정된 사람은 거의 같은 메일을 두 번** 받고 있었다. `(applicant_id, stage)`
 * UNIQUE 는 단계가 다르면 막지 않는다. 하루 한도(400통)도 그만큼 더 먹었다.
 *
 * 그래서 `interview` 는 **발표 뒤 배정이 바뀐 사람에게 다시 알리는** 용도로만 남긴다.
 */
export const STAGE_LABEL: Record<ResultMailStage, string> = {
  document: '서류 결과 및 면접 일정 안내',
  interview: '면접 일정 변경 안내',
  final: '최종 결과 안내',
};

/** 화면에서 라벨 밑에 붙는 한 줄 — 누구에게 가는 안내인지. 셋을 다 눌러야 하는 것처럼 보이면 안 된다. */
export const STAGE_DESC: Record<ResultMailStage, string> = {
  document: '서류 결과가 정해진 지원자 전원에게',
  interview: '발표 뒤 면접 배정이 바뀐 사람에게만 다시',
  final: '최종 결과가 정해진 지원자 전원에게',
};

/**
 * 서류 결과가 정해진 상태 — `lookup-visibility.ts` 의 DOC_DECIDED 와 **같은 집합**이다.
 * 같아야 하는 이유: 메일을 받은 사람이 조회 화면에 들어왔을 때 반드시 결과가 보여야 한다.
 * 한쪽만 넓으면 "결과 나왔다"는 메일을 받고 들어와 "심사 중" 을 보게 된다.
 */
const DOC_DECIDED: ReadonlySet<RecruitStatus> = new Set<RecruitStatus>([
  'doc_pass',
  'doc_fail',
  'interview_done',
  'interview_noshow',
  'final_pass',
  'final_fail',
]);

const FINAL_DECIDED: ReadonlySet<RecruitStatus> = new Set<RecruitStatus>(['final_pass', 'final_fail']);

/** 이 단계를 보내려면 기수의 어느 공개 스위치가 켜져 있어야 하는가. */
export function requiredSwitch(stage: ResultMailStage): 'schedulePublic' | 'resultPublic' {
  return stage === 'final' ? 'resultPublic' : 'schedulePublic';
}

/**
 * 이 지원자가 이 단계 안내 메일의 대상인가.
 *
 * - `document` — 서류 결과가 정해진 사람 전원(합격·불합격 모두). 조회 화면 기준과 같다.
 *   면접 일정 안내를 겸하므로(STAGE_LABEL 주석) 이 한 통이면 발표가 끝난다.
 * - `interview` — **아직 면접 전이면서 자리가 잡힌 사람**(`doc_pass` + 슬롯 배정).
 *   발표 뒤 배정이 바뀐 사람에게 다시 알리는 용도다. 면접이 끝난 사람에게는 보내지 않는다.
 * - `final` — 최종 결과가 정해진 사람 전원(합격·불합격 모두).
 */
export function isResultMailTarget(
  stage: ResultMailStage,
  applicant: { status: RecruitStatus; slotId: string | null; email: string | null }
): boolean {
  // 이메일이 없으면 보낼 곳이 없다. 지원서에서 이메일 문항을 끈 기수도 있다(결정 146).
  // **형식까지 본다**: 접수 라우트가 막기 전에 저장된 행에는 주소가 아닌 값이 들어 있을 수 있고,
  // 그 값은 곧장 nodemailer 의 `to` 가 된다(src/lib/email.ts). 대상에서 빼면 대기열에 담기지도
  // 않고, 미리보기 인원수도 실제로 나갈 통수와 어긋나지 않는다.
  if (!isValidEmail(applicant.email)) return false;

  switch (stage) {
    case 'document':
      return DOC_DECIDED.has(applicant.status);
    case 'interview':
      return applicant.status === 'doc_pass' && applicant.slotId !== null;
    case 'final':
      return FINAL_DECIDED.has(applicant.status);
  }
}

/**
 * Gmail 무료 계정의 하루 발송 한도는 약 500통이다. 그 통을 **로그인·가입 인증 코드 메일과
 * 함께 쓴다** — 안내 메일이 한도를 다 먹으면 그날 아무도 로그인하지 못한다. 그 사고가 훨씬 비싸므로
 * 안내 메일은 400통까지만 쓰고 100통을 인증용으로 남긴다.
 *
 * 남은 것은 사라지지 않고 `queued` 로 남아 **다음 날 이어서 나간다**(2026-08-26 사용자 결정).
 */
export const DAILY_CAP = 400;

/** 크론 한 번에 보내는 최대 통수. 한 번에 몰아 보내면 Gmail 이 도배로 본다. */
export const BATCH_PER_TICK = 25;

/**
 * 지금 이 사이클에 실제로 보낼 통수.
 *
 * 최근 24시간 발송량을 기준으로 한다(Gmail 한도가 하루 경계가 아니라 **구르는 24시간**이다).
 * 자정에 초기화된다고 보고 몰아 보내면 그 경계에서 막힌다.
 */
export function sendableNow(sentInLast24h: number, queuedCount: number): number {
  const remainingToday = Math.max(0, DAILY_CAP - sentInLast24h);
  return Math.max(0, Math.min(queuedCount, remainingToday, BATCH_PER_TICK));
}

/** 재시도 상한 — 규칙 #5(최대 2회 재시도 후 failed 확정 + 운영진 알림). */
export const MAX_ATTEMPTS = 3;

/** 이번 실패로 최종 실패(failed)가 되는가, 아니면 다음 사이클에 다시 시도하는가. */
export const isExhausted = (attempts: number): boolean => attempts >= MAX_ATTEMPTS;

/**
 * 첫 문장. 조사가 단계마다 달라서(`결과가` / `일정이`) 한 틀에 끼워 넣지 않고 문장째 적는다 —
 * 끼워 넣으면 "면접 일정가 나왔습니다" 가 된다.
 */
const LEAD: Record<ResultMailStage, string> = {
  document: '서류 심사 결과와 면접 일정이 나왔습니다.',
  interview: '면접 일정이 바뀌었습니다.',
  final: '최종 결과가 나왔습니다.',
};

/**
 * 조회 화면에서 무엇을 하면 되는지.
 *
 * ⚠ `document` 의 면접 줄은 **"면접 일정이 잡힌 경우"** 라는 조건문이어야 한다. "면접 일시를
 * 확인하세요" 라고 단정하면 그 메일을 받은 사실만으로 서류를 통과했다는 뜻이 되어, 당락을 메일에
 * 쓰지 않는다는 원칙(파일 머리 주석)이 무너진다. 이 메일은 불합격자에게도 **똑같이** 간다.
 */
const GUIDE: Record<ResultMailStage, string> = {
  document:
    '조회 화면에서 지원하실 때 적으신 이름과 전화번호를 입력하시면 결과를 보실 수 있습니다.\n' +
    '면접 일정이 잡힌 경우, 일시와 장소(비대면이면 접속 링크)도 같은 화면에서 함께 보실 수 있습니다.',
  // 첫 문장이 이미 "확인해 주세요" 로 끝난다 — 여기서 또 쓰면 한 통에 같은 부탁이 두 번 나온다.
  interview: '바뀐 일시와 장소(비대면이면 접속 링크)를 같은 화면에서 보실 수 있습니다.',
  final: '조회 화면에서 지원하실 때 적으신 이름과 전화번호를 입력하시면 결과를 보실 수 있습니다.',
};

/**
 * 메일 제목·본문. **당락을 쓰지 않는다**(파일 머리 주석).
 *
 * 조회 주소를 본문에 그대로 적는다 — 지원자는 비부원이라 계정이 없고, 링크가 없으면
 * "홈페이지" 가 어디인지 찾다가 포기한다.
 */
export function resultMailContent(
  stage: ResultMailStage,
  cohortLabel: string,
  lookupUrl: string
): { subject: string; text: string } {
  return {
    // 제목은 화면 라벨(STAGE_LABEL)을 그대로 쓴다 — 회장단이 카드에서 고른 이름과 지원자가 받는
    // 제목이 같아야, 어느 버튼이 무슨 메일을 보내는지 눌러 보지 않고 안다.
    // "최종 **합격** 결과 안내" 처럼 쓰지 않는다: 문법적으로는 중립이지만 제목만 훑으면 '합격'
    // 두 글자가 먼저 읽혀, 불합격자에게는 기대를 줬다 뺏는 제목이 된다(단위 테스트가 금지한다).
    subject: `[애니멀메이트] ${cohortLabel} ${STAGE_LABEL[stage]}`,
    text:
      `안녕하세요, 애니멀메이트입니다.\n\n` +
      `${cohortLabel} ${LEAD[stage]} 아래 주소에서 확인해 주세요.\n\n` +
      `${lookupUrl}\n\n` +
      `${GUIDE[stage]}\n\n` +
      // 메일 본문에 결과를 적지 않는 이유를 지원자에게도 알려 준다 — 안 그러면 "왜 결과가 안 적혀
      // 있지" 하고 스팸이나 오발송으로 의심한다.
      // 면접 변경 안내에는 당락이 없다 — 거기에 "결과는" 이라고 쓰면 무슨 결과를 말하는지 몰라
      // 오히려 당락 메일로 읽힌다.
      `개인정보 보호를 위해 ${stage === 'interview' ? '자세한 내용은' : '결과는'} 메일에 적지 않고 조회 화면에서만 보여 드립니다.\n` +
      `메일이 안 보이면 스팸함을 확인해 주세요.\n\n` +
      `지원해 주셔서 감사합니다.\n` +
      `애니멀메이트 드림`,
  };
}
