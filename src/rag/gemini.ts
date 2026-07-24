// Gemini 클라이언트 — 임베딩(RAG 검색) + 생성(챗봇)의 유일한 진입점. 서버 전용.
//
// 모델 ID 는 env 로만 주입한다(07-DECISIONS 14, 하드코딩 금지). 미설정이면 즉시 에러 — 조용히
// 잘못된 모델로 동작하는 것보다 낫다. 임베딩은 outputDimensionality=768 을 **반드시** 명시한다
// (07-DECISIONS 15: 빠뜨리면 3072차원이 돌아와 doc_chunks 삽입이 실패한다).

import 'server-only';

const API = 'https://generativelanguage.googleapis.com/v1beta';
export const EMBED_DIM = 768;

function apiKey(): string {
  const k = process.env.GEMINI_API_KEY?.trim();
  if (!k) throw new Error('GEMINI_API_KEY 가 설정되지 않았습니다(서버 환경변수).');
  return k;
}
function embeddingModel(): string {
  const m = process.env.GEMINI_EMBEDDING_MODEL?.trim();
  if (!m) throw new Error('GEMINI_EMBEDDING_MODEL 이 설정되지 않았습니다.');
  return m;
}
function generationModel(): string {
  const m = process.env.GEMINI_MODEL?.trim();
  if (!m) throw new Error('GEMINI_MODEL 이 설정되지 않았습니다.');
  return m;
}

const headers = () => ({ 'x-goog-api-key': apiKey(), 'Content-Type': 'application/json' });

/** 임베딩 용도 — 문서 저장 시 DOCUMENT, 질문 검색 시 QUERY. 대칭이 아니라 품질에 영향을 준다. */
export type EmbedTask = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly raw?: unknown
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

interface EmbedResult {
  embedding?: { values?: number[] };
}

/** 여러 텍스트를 한 번에 임베딩(배치). 순서는 입력과 동일. 각 벡터는 768차원·정규화됨. */
export async function embedTexts(texts: string[], task: EmbedTask): Promise<number[][]> {
  if (texts.length === 0) return [];
  const name = `models/${embeddingModel()}`;
  const res = await fetch(`${API}/${name}:batchEmbedContents`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      requests: texts.map((text) => ({
        model: name,
        content: { parts: [{ text }] },
        taskType: task,
        outputDimensionality: EMBED_DIM, // 필수(07-DECISIONS 15)
      })),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { embeddings?: EmbedResult['embedding'][]; error?: { message?: string } };
  if (!res.ok) throw new GeminiError(`임베딩 실패: ${body?.error?.message ?? res.status}`, res.status, body);
  const vecs = (body.embeddings ?? []).map((e) => e?.values ?? []);
  if (vecs.length !== texts.length || vecs.some((v) => v.length !== EMBED_DIM)) {
    throw new GeminiError(`임베딩 차원 이상(기대 ${EMBED_DIM}, 개수 ${vecs.length}/${texts.length})`, res.status, body);
  }
  return vecs;
}

export async function embedText(text: string, task: EmbedTask): Promise<number[]> {
  const [v] = await embedTexts([text], task);
  return v!;
}

// ── 생성(챗봇) ─────────────────────────────────────────────────────────
// 인젝션 방어: 시스템 지시는 systemInstruction 으로, 사용자 입력·검색 자료는 user content 로 분리한다.
// 모델이 자료 안의 "이전 지시를 무시하라" 류를 지시가 아니라 데이터로 취급하게 하는 경계.

export interface GeminiTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema
}

export interface GenPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}
export interface GenContent {
  role: 'user' | 'model';
  parts: GenPart[];
}

export interface GenerateArgs {
  system: string;
  contents: GenContent[];
  tools?: GeminiTool[];
  temperature?: number;
}
export interface GenerateResult {
  text: string;
  functionCalls: { name: string; args: Record<string, unknown> }[];
}

/** 한 번의 생성 호출. 함수 호출이 있으면 functionCalls 로 돌려준다(호출부가 tool 실행 후 재호출). */
export async function generate(args: GenerateArgs): Promise<GenerateResult> {
  const name = `models/${generationModel()}`;
  const payload: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: args.system }] },
    contents: args.contents,
    generationConfig: { temperature: args.temperature ?? 0.2 },
  };
  if (args.tools?.length) {
    payload.tools = [{ functionDeclarations: args.tools }];
  }
  const res = await fetch(`${API}/${name}:generateContent`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as {
    candidates?: { content?: { parts?: GenPart[] } }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new GeminiError(`생성 실패: ${body?.error?.message ?? res.status}`, res.status, body);
  const parts = body.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? '').join('').trim();
  const functionCalls = parts.filter((p) => p.functionCall).map((p) => p.functionCall!);
  return { text, functionCalls };
}
