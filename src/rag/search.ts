// RAG 검색 — 질문 임베딩 → 코사인 top-k. **visibility 필터를 SQL WHERE 로 강제**한다.
//
// 규칙(03 접근 규칙 4, 절대 금지): 질문자 역할 이하의 문서만 검색된다. 이 필터는 반드시
// **쿼리 레벨**에서 건다 — 검색 후 코드로 걸러내면(post-filter) 실수 한 번에 상위 등급 문서가
// 새어 나간다. 여기서는 역할이 볼 수 있는 visibility 값만 WHERE inArray 로 제한해, 애초에
// 그 행들이 결과에 들어오지 않게 한다.

import { eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@/db/types';
import { docChunks, documents } from '@/db/schema';
import type { Actor } from '@/auth/permissions';
import { embedText } from './gemini';
import { allowedVisibilities, type Visibility } from '@/auth/visibility';

// 문서 검색이 쓰는 등급 필터는 일정 캘린더와 **같은 정의**를 본다(@/auth/visibility).
// 기존 import 경로(`@/rag/search` 에서 allowedVisibilities)를 깨지 않도록 다시 내보낸다.
export { allowedVisibilities };

export interface SearchHit {
  documentId: string;
  title: string;
  visibility: Visibility;
  content: string;
  similarity: number; // 1=동일, 0=무관(정규화 벡터 코사인)
}

export const TOP_K = 5;
// 노이즈 바닥값(관련도 판단용 아님). 짧은 한국어 질문은 관련 문서와의 코사인이 0.45~0.65,
// **무관한 문서와도 0.4~0.55** 로 겹쳐서(2026-07-24 실측) 유사도로는 관련/무관을 못 가른다.
// 그래서 컷오프로 관련성을 판단하지 않고, 가까운 top-k 를 그대로 모델에 넘겨 **모델이** 답할 수 있는지
// 판단하게 한다(시스템 프롬프트가 "자료에 없으면 핸드오프"를 강제). 이 값은 "DB 에 아무것도 안 가까울 때"
// 만 거르는 낮은 바닥이다. 이걸 0.55 로 잡았다가 "OT 언제야?"(0.49) 같은 정상 질문이 걸러지는 버그가 있었다.
export const MIN_SIMILARITY = 0.3;

/**
 * 질문과 가까운 문서 조각 top-k. visibility 는 SQL 에서 강제, 관련도 컷오프는 그 뒤에 적용한다
 * (컷오프는 보안이 아니라 품질 필터라 후처리해도 안전 — 보안 필터인 visibility 만 WHERE 에 둔다).
 */
export async function searchChunks(db: Db, actor: Actor, question: string, k = TOP_K): Promise<SearchHit[]> {
  const q = question.trim();
  if (!q) return [];

  const queryVec = await embedText(q, 'RETRIEVAL_QUERY');
  const literal = `[${queryVec.join(',')}]`; // pgvector 리터럴
  const allowed = allowedVisibilities(actor);
  if (allowed.length === 0) return [];

  // <=> = 코사인 거리(0=동일). 정규화 벡터라 similarity = 1 - distance.
  const distance = sql<number>`${docChunks.embedding} <=> ${literal}::vector`;
  const rows = await db
    .select({
      documentId: documents.id,
      title: documents.title,
      visibility: documents.visibility,
      content: docChunks.content,
      distance,
    })
    .from(docChunks)
    .innerJoin(documents, eq(documents.id, docChunks.documentId))
    .where(inArray(documents.visibility, allowed)) // ← 보안 필터(쿼리 레벨 강제)
    .orderBy(distance)
    .limit(k);

  return rows
    .map((r) => ({
      documentId: r.documentId,
      title: r.title,
      visibility: r.visibility,
      content: r.content,
      similarity: 1 - Number(r.distance),
    }))
    .filter((h) => h.similarity >= MIN_SIMILARITY);
}

/**
 * 검색 결과를 챗봇 프롬프트에 넣을 "자료" 블록 + 중복 제거된 출처 문서명.
 *
 * ⚠ **모델에게 주는 자료에는 문서명을 넣지 않는다.** 예전에는 조각마다
 * `[자료 1 · 출처: 회칙]` 처럼 붙였는데, 시스템 프롬프트로는 "출처를 쓰지 말라"고 하면서
 * 자료에는 `출처: X` 를 top-k 번 먹이는 셈이라 모델이 그대로 따라 썼다(2026-07-29 QA).
 * 그러니 모델은 문서명을 알 필요가 없다.
 *
 * 돌려주는 `sources` 는 **화면에 그리지 않는다**(2026-07-31, 결정 69 — 대화가 검색 결과처럼
 * 읽혔다). `chat_logs` 에만 남겨, 답이 이상할 때 무엇을 집어 왔는지 되짚고 평가셋을 돌리는 값이다.
 */
export function buildContextBlock(hits: SearchHit[]): { context: string; sources: string[] } {
  const sources = [...new Set(hits.map((h) => h.title))];
  const context = hits.map((h, i) => `[자료 ${i + 1}]\n${h.content}`).join('\n\n---\n\n');
  return { context, sources };
}
