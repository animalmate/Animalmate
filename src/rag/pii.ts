// PII(개인정보) 패턴 감지 — 문서 저장 파이프라인의 경고 장치(규칙 #5).
//
// 왜: RAG 인덱스(doc_chunks)에 회원 명단·연락처·계좌·주민번호가 들어가면, 챗봇이 그걸 검색해
// 아무에게나 흘릴 수 있다. 저장 시 패턴을 감지해 경고하고 pii_checked 확인을 요구한다.
// 이건 차단이 아니라 경고다 — 오탐(예: 봉사 장소 전화번호)을 사람이 판단해 통과시킬 수 있어야 한다.
//
// 순수 함수(단위 테스트 대상). 완벽한 탐지가 아니라 "흔한 실수"를 잡는 것이 목표다.

export interface PiiFinding {
  kind: 'phone' | 'rrn' | 'account' | 'email' | 'card';
  label: string;
  sample: string; // 감지된 첫 예시(마스킹해서 어디를 봐야 하는지만 알려준다)
}

function mask(s: string): string {
  if (s.length <= 4) return s[0] + '*'.repeat(Math.max(0, s.length - 1));
  return s.slice(0, 3) + '*'.repeat(s.length - 5) + s.slice(-2);
}

// 한국 휴대폰: 010-1234-5678 / 01012345678 / 010.1234.5678
const PHONE_RE = /(?<!\d)01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/g;
// 주민등록번호: 901231-1234567 (뒤 7자리). 앞 6자리 생년월일 + 성별코드.
const RRN_RE = /(?<!\d)\d{6}[-\s]?[1-4]\d{6}(?!\d)/g;
// 계좌번호: "계좌"·"account" 문맥 근처의 10~16자리(하이픈 허용). 문맥 없는 긴 숫자 오탐 방지.
//
// ⚠ **`g` 플래그를 다시 붙이지 말 것.** 이 값은 모듈 스코프 상수이고 아래에서 `.exec()` 로 쓴다.
//    `g` 가 있으면 `lastIndex` 가 호출과 호출 사이에 남아, **다음 호출이 그 위치부터 찾는다** —
//    한 번 잡은 뒤의 호출은 앞쪽에 있는 계좌번호를 통째로 놓치고(그 다음 호출에서 0 으로 돌아온다),
//    결과가 한 번 걸러 한 번씩 빠진다. `String.match` 는 `lastIndex` 를 리셋하지만 `RegExp.exec`
//    은 하지 않는다 — 그래서 아래 다른 패턴들(`match` 사용)은 멀쩡한데 이것만 샜다.
//    이 게이트가 새면 계좌번호가 `chat_logs` 와 Google 로, RAG 인덱스로 들어간다(절대 금지 #5).
//    회귀 테스트: pii.test.ts "연속 호출" 케이스.
const ACCOUNT_CTX_RE = /(계좌|입금|송금|account)[^\n]{0,20}?(?<!\d)(\d[\d-]{8,17}\d)(?!\d)/i;
// 신용카드: 4자리 4묶음.
const CARD_RE = /(?<!\d)(?:\d{4}[-\s]?){3}\d{4}(?!\d)/g;
// 이메일.
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * 본문에서 PII 패턴을 찾는다. 종류별로 첫 예시만(마스킹) 돌려준다.
 * 카드가 먼저 매칭되면 주민번호/전화 오탐을 줄이기 위해 순서에 유의(카드 → 주민 → 전화).
 */
export function detectPii(text: string): PiiFinding[] {
  const found: PiiFinding[] = [];
  const seen = new Set<string>();
  const add = (kind: PiiFinding['kind'], label: string, sample: string) => {
    if (seen.has(kind)) return;
    seen.add(kind);
    found.push({ kind, label, sample: mask(sample.trim()) });
  };

  // 카드·주민번호를 전화보다 먼저 본다(형식이 더 구체적이라 겹칠 때 우선).
  const card = text.match(CARD_RE);
  if (card) add('card', '카드번호로 보이는 숫자', card[0]);
  const rrn = text.match(RRN_RE);
  if (rrn) add('rrn', '주민등록번호로 보이는 숫자', rrn[0]);
  const acct = ACCOUNT_CTX_RE.exec(text);
  if (acct) add('account', '계좌번호로 보이는 숫자', acct[2]!);
  const phone = text.match(PHONE_RE);
  if (phone) add('phone', '휴대폰 번호', phone[0]);
  const email = text.match(EMAIL_RE);
  if (email) add('email', '이메일 주소', email[0]);

  return found;
}

/**
 * 챗봇 **질문**에 들어와선 안 되는 식별번호만 골라낸다(주민등록번호·카드·계좌).
 *
 * 왜 전부가 아니라 셋만인가: 전화·이메일은 대화에 정상적으로 나온다
 * ("운영진 메일 어디예요?", "010 으로 연락 오나요?"). 그것까지 막으면 멀쩡한 질문이
 * 거부되어, 실사용 첫날에 챗봇이 고장 난 것처럼 보인다. 반면 주민등록번호·카드·계좌는
 * 동아리 챗봇 질문에 들어갈 이유가 **없고**, 들어오면 `chat_logs` 에 그대로 남는 데다
 * 답변 생성을 위해 Google 로도 전송된다(개인정보처리방침에 고지된 경로다).
 * 그래서 이 셋만 **질문 단계에서 끊는다** — 화면 안내(입력창 문구)의 서버 쪽 짝이다.
 *
 * 문서 저장 파이프라인은 지금처럼 `detectPii` 전체를 쓴다(거기서는 경고이지 차단이 아니다).
 */
export function findSensitiveIds(text: string): PiiFinding[] {
  return detectPii(text).filter((f) => f.kind === 'rrn' || f.kind === 'card' || f.kind === 'account');
}

/** 감지 결과가 있으면 사용자에게 보여줄 한 줄 요약. */
export function piiWarning(findings: PiiFinding[]): string | null {
  if (findings.length === 0) return null;
  const kinds = findings.map((f) => f.label).join(', ');
  return `개인정보로 보이는 내용이 있습니다(${kinds}). 회원 명단·연락처·계좌는 챗봇 자료에 넣지 마세요. 그래도 저장하려면 확인이 필요합니다.`;
}
