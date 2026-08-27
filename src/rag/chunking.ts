// 문서 청킹 — 마크다운 헤딩 기준으로 300~500토큰 조각으로 나눈다(순수 함수, 단위 테스트 대상).
//
// 왜 헤딩 기준인가: 헤딩은 저자가 직접 그은 의미 경계라, 그 단위로 자르면 한 조각이 한 주제를 담는다.
// 각 조각 앞에 상위 헤딩 경로("운영 > 회비")를 붙여 문맥을 준다 — 검색은 조각 단위로 이뤄지므로
// 조각만 봐도 무엇에 대한 내용인지 알 수 있어야 답변 품질이 오른다.
//
// 토큰 수는 정확한 토크나이저 없이 추정한다(Gemini 토크나이저는 서버 전용·비공개). 한국어·영어가
// 섞인 본문에서 대략 1토큰 ≈ 2.5자로 잡는다. 정확할 필요는 없다 — 조각이 임베딩 입력 한도(8192토큰)
// 안에 들어오고 검색에 적당한 크기이기만 하면 된다.

export interface Chunk {
  index: number;
  content: string;
}

const CHARS_PER_TOKEN = 2.5;
export const TARGET_MAX_TOKENS = 500;
export const TARGET_MIN_TOKENS = 300;
const MAX_CHARS = Math.round(TARGET_MAX_TOKENS * CHARS_PER_TOKEN); // ~1250
const MIN_CHARS = Math.round(TARGET_MIN_TOKENS * CHARS_PER_TOKEN); // ~750

/** 대략적인 토큰 수(임베딩 입력 한도 점검·청크 크기 판단용). 정확한 값 아님. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

interface Section {
  headingPath: string; // "운영 > 회비" (조각 앞에 붙는 문맥)
  body: string;
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;

/**
 * 제목 없이 `##` 만 있는 줄 — **손으로 쓴 문서에서 흔한 구분선**이다. 마크다운 문법으로는
 * 헤딩이 아니지만 저자가 그은 의미 경계라는 점은 똑같으므로 섹션 경계로 인정한다.
 *
 * 왜 생겼나(2026-08-28, 평가셋이 잡았다): `33기 동아리 기본 정보`(1563자)가 `##` 를 항목
 * 구분선으로만 쓰는 문서였는데, 위 정규식이 `#{1,6}\s+제목` 만 보느라 **문서 전체가 한 섹션**이
 * 됐다. 그러면 의미 경계가 없으니 길이로만 잘려 982자짜리 잡탕 조각이 생긴다 — 소개·모집팀·
 * 활동기간·기수·회비·활동내용이 한 덩어리다. 그 조각은 "회비는 얼마예요?" 와의 코사인이
 * **12위(0.520)** 까지 밀려 top-5 에 못 들었고, 답이 문서에 그대로 있는데 챗봇이 핸드오프했다.
 * 부원이 가장 많이 묻는 질문이 답이 없는 질문이 되어 있었다.
 *
 * ⚠ 헤딩 스택은 건드리지 않는다 — 제목이 없으니 경로에 넣을 것이 없고, 넣으면 빈 칸이 낀
 * 경로("동아리 › › 회비")가 만들어진다. 앞 섹션을 **닫기만** 한다.
 */
const BARE_HEADING_RE = /^#{1,6}\s*$/;

/** 마크다운을 헤딩 경계로 섹션 분할. 각 섹션은 상위 헤딩 경로를 함께 갖는다. */
function splitSections(md: string): Section[] {
  const lines = md.split(/\r?\n/);
  const sections: Section[] = [];
  const stack: { level: number; title: string }[] = []; // 상위 헤딩 스택
  let buf: string[] = [];

  const pathOf = () => stack.map((s) => s.title).join(' › ');
  const flush = () => {
    const body = buf.join('\n').trim();
    if (body) sections.push({ headingPath: pathOf(), body });
    buf = [];
  };

  for (const line of lines) {
    if (BARE_HEADING_RE.test(line)) {
      flush(); // 제목 없는 구분선 — 앞 섹션만 닫고 헤딩 경로는 그대로 둔다.
      continue;
    }
    const m = HEADING_RE.exec(line);
    if (m) {
      flush(); // 헤딩 전까지의 본문을 한 섹션으로 마감
      const level = m[1]!.length;
      const title = m[2]!.trim();
      while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
      stack.push({ level, title });
    } else {
      buf.push(line);
    }
  }
  flush();
  return sections;
}

/** 문단(빈 줄) 경계로 나눈다. 헤딩 없는 긴 섹션을 더 잘게 쪼갤 때. */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** 한 문단이 MAX_CHARS 를 넘으면 문장/줄 단위로 강제 분할(초장문 방어). */
function hardSplit(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > MAX_CHARS) {
    // 되도록 문장 끝(. ! ? 줄바꿈)에서 끊는다.
    let cut = rest.lastIndexOf('\n', MAX_CHARS);
    if (cut < MIN_CHARS) cut = Math.max(rest.lastIndexOf('. ', MAX_CHARS), rest.lastIndexOf('。', MAX_CHARS));
    if (cut < MIN_CHARS) cut = MAX_CHARS; // 끊을 곳이 없으면 그냥 자른다
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * 문서(제목 + 마크다운 본문)를 검색용 조각으로 나눈다.
 * - 헤딩 경계로 섹션을 나누고, 섹션이 크면 문단→(초장문이면)문장 단위로 더 쪼갠다.
 * - 인접한 작은 조각은 MAX 까지 이어 붙여 너무 잘게 쪼개지지 않게 한다.
 * - 각 조각 앞에 "제목 › 헤딩경로" 를 붙여 문맥을 준다.
 */
export function chunkDocument(title: string, contentMd: string): Chunk[] {
  const sections = splitSections(contentMd);
  const pieces: { path: string; text: string }[] = [];

  for (const sec of sections) {
    const units = sec.body.length <= MAX_CHARS ? [sec.body] : splitParagraphs(sec.body).flatMap(hardSplit);
    // 같은 섹션 안에서 작은 문단들을 MAX 까지 병합.
    let acc = '';
    for (const u of units) {
      if (acc && acc.length + u.length + 2 > MAX_CHARS) {
        pieces.push({ path: sec.headingPath, text: acc });
        acc = u;
      } else {
        acc = acc ? `${acc}\n\n${u}` : u;
      }
    }
    if (acc.trim()) pieces.push({ path: sec.headingPath, text: acc });
  }

  // 문맥 접두사(제목/헤딩경로)를 붙여 최종 조각을 만든다.
  const prefix = (path: string) => {
    const head = [title.trim(), path].filter(Boolean).join(' › ');
    return head ? `[${head}]\n` : '';
  };
  return pieces
    .map((p) => `${prefix(p.path)}${p.text}`.trim())
    .filter(Boolean)
    .map((content, index) => ({ index, content }));
}
