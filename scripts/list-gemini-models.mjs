// Gemini 모델 목록 조회 — 챗봇(1D)에 쓸 **정확한 모델 ID** 를 확정하기 위한 조회 도구.
//
// 왜 필요한가: 04-TODO/07-DECISIONS 규칙상 모델 ID 는 코드에 하드코딩하지 않고 env 로만 주입한다.
// 그러려면 "지금 이 키로 실제 호출 가능한 ID" 를 눈으로 확인해야 한다. 제품명(Gemini 3.1 Flash-Lite)과
// API 모델 ID 는 다르며, 구형 2.0 계열은 쓰지 않는다.
//
// 임베딩 모델은 **출력 차원**까지 확인한다 — doc_chunks.embedding 이 vector(768) 로 고정돼 있어
// 차원이 다르면 컬럼 재생성 마이그레이션이 필요하다.
//
// 실행: node scripts/list-gemini-models.mjs [--all] [--probe]
//   --all    구형 2.0 계열까지 전부 출력(기본은 제외)
//   --probe  임베딩 후보를 실제로 1회 호출해 출력 차원을 측정(소량 토큰 소모)
// 필요 env: GEMINI_API_KEY

import './load-env.mjs';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const KEY = (process.env.GEMINI_API_KEY ?? '').trim();
const SHOW_ALL = process.argv.includes('--all');
const PROBE = process.argv.includes('--probe');

if (!KEY) {
  console.error('❌ GEMINI_API_KEY 가 없습니다(.env 확인).');
  process.exit(1);
}

// 키를 URL 쿼리에 붙이면 서버 접근 로그·프록시에 남는다 — 헤더로 보낸다.
const headers = { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' };

/** 구형(2.0 이하) 계열인가 — 쓰지 않기로 한 모델. */
function isLegacy(id) {
  return /gemini-(1\.0|1\.5|2\.0)/.test(id) || /embedding-001$/.test(id) || /text-embedding-004$/.test(id);
}

async function listModels() {
  const out = [];
  let pageToken = '';
  do {
    const url = `${API}/models?pageSize=200${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url, { headers });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = body?.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`모델 목록 조회 실패 (${res.status}): ${msg}`);
    }
    out.push(...(body.models ?? []));
    pageToken = body.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

/**
 * 임베딩 모델을 1회 호출해 실제 출력 차원을 잰다(선언값이 없거나 믿기 어려울 때).
 * @param want outputDimensionality 로 요청할 차원(Matryoshka 축소 지원 여부 확인용). 없으면 기본 차원.
 */
async function probeEmbeddingDim(id, want) {
  const name = id.startsWith('models/') ? id : `models/${id}`;
  const payload = { model: name, content: { parts: [{ text: '차원 확인용 샘플 문장' }] } };
  if (want) payload.outputDimensionality = want;
  const res = await fetch(`${API}/${name}:embedContent`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body?.error?.message ?? `HTTP ${res.status}` };
  const values = body?.embedding?.values ?? body?.embeddings?.[0]?.values;
  if (!Array.isArray(values)) return { error: '응답에 embedding.values 없음' };
  // 코사인 검색은 정규화된 벡터를 전제한다. 축소 차원은 정규화가 깨져 나올 수 있어 노름을 함께 잰다.
  const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0));
  return { dim: values.length, norm };
}

const supports = (m, method) => (m.supportedGenerationMethods ?? []).includes(method);

function row(m) {
  const id = (m.name ?? '').replace(/^models\//, '');
  return {
    id,
    표시이름: m.displayName ?? '',
    입력토큰: m.inputTokenLimit ?? '',
    출력토큰: m.outputTokenLimit ?? '',
    선언차원: m.outputDimension ?? '',
  };
}

const models = await listModels();
console.log(`\n총 ${models.length}개 모델 조회됨 (구형 제외: ${SHOW_ALL ? '아니오' : '예'})\n`);

const visible = models.filter((m) => SHOW_ALL || !isLegacy((m.name ?? '').replace(/^models\//, '')));

// ── 생성 모델 ─────────────────────────────────────────────────────────
const gen = visible.filter((m) => supports(m, 'generateContent'));
const flashLite = gen.filter((m) => /flash-lite/i.test(m.name ?? ''));

console.log('■ Flash-Lite 계열 생성 모델 (챗봇 후보)');
if (flashLite.length === 0) {
  console.log('  (없음 — --all 로 전체를 확인하세요)');
} else {
  console.table(flashLite.map(row).map(({ 선언차원, ...r }) => r));
}

console.log('\n■ 그 외 생성 모델(참고, 최대 15개)');
console.table(
  gen
    .filter((m) => !/flash-lite/i.test(m.name ?? ''))
    .slice(0, 15)
    .map(row)
    .map(({ 선언차원, ...r }) => r)
);

// ── 임베딩 모델 ───────────────────────────────────────────────────────
const emb = visible.filter((m) => supports(m, 'embedContent'));
console.log('\n■ 임베딩 모델 후보');
console.table(emb.map(row).map(({ 출력토큰, ...r }) => r));

if (PROBE && emb.length > 0) {
  console.log('\n■ 실제 출력 차원 측정(--probe)');
  // 768 은 doc_chunks.embedding 의 현재 차원이자 pgvector HNSW 인덱스 한도(2000) 안쪽 값이다.
  const WANTED = [undefined, 768, 1536];
  for (const m of emb) {
    const id = (m.name ?? '').replace(/^models\//, '');
    for (const want of WANTED) {
      const r = await probeEmbeddingDim(id, want);
      const label = want ? `outputDimensionality=${want}` : '기본(요청 안 함)';
      const result = r.dim ? `${r.dim}차원 (L2 노름 ${r.norm.toFixed(4)})` : `실패: ${r.error}`;
      console.log(`  ${id.padEnd(28)} ${label.padEnd(28)} → ${result}`);
    }
  }
  console.log('  ※ 노름이 1.0 이 아니면 코사인 검색 전에 정규화가 필요하다.');
}

console.log(`
다음 할 일:
  1. 위에서 고른 ID 를 .env 와 Vercel 의 GEMINI_MODEL / GEMINI_EMBEDDING_MODEL 에 넣는다.
  2. 임베딩 차원이 768 이 아니면 doc_chunks.embedding 재생성 마이그레이션이 필요하다(03-DATA-MODEL).
  3. 코드에 기본값을 하드코딩하지 않는다 — env 미설정 시 즉시 에러가 원칙(07-DECISIONS).
`);
