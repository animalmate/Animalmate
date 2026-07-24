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
