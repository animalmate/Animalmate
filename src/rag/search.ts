// RAG 검색 — 질문 임베딩 → 코사인 top-k. **visibility 필터를 SQL WHERE 로 강제**한다.
//
// 규칙(03 접근 규칙 4, 절대 금지): 질문자 역할 이하의 문서만 검색된다. 이 필터는 반드시
// **쿼리 레벨**에서 건다 — 검색 후 코드로 걸러내면(post-filter) 실수 한 번에 상위 등급 문서가
// 새어 나간다. 여기서는 역할이 볼 수 있는 visibility 값만 WHERE inArray 로 제한해, 애초에
// 그 행들이 결과에 들어오지 않게 한다.

import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@/db/types';
import { docChunks, documents } from '@/db/schema';
import type { Actor } from '@/auth/permissions';
import { embedText } from './gemini';
import { VISIBILITY_RANK, roleVisibilityRank, type Visibility } from './documents';

export interface SearchHit {
  documentId: string;
  title: string;
  visibility: Visibility;
  content: string;
  similarity: number; // 1=동일, 0=무관(정규화 벡터 코사인)
}

export const TOP_K = 5;
// 이 값 미만은 "근거로 쓸 만큼 가깝지 않다"고 보고 버린다 → 근거 없으면 챗봇이 핸드오프한다.
export const MIN_SIMILARITY = 0.55;

/** 질문자 역할이 볼 수 있는 visibility 값 목록(rank ≤ 역할 rank). */
export function allowedVisibilities(actor: Actor): Visibility[] {
  const rank = roleVisibilityRank(actor.role);
  return (Object.keys(VISIBILITY_RANK) as Visibility[]).filter((v) => VISIBILITY_RANK[v] <= rank);
}

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

/** 검색 결과를 챗봇 프롬프트에 넣을 "자료" 블록으로 만든다(출처 표시 + 인젝션 경계 명시). */
export function buildContextBlock(hits: SearchHit[]): { context: string; sources: string[] } {
  const sources = [...new Set(hits.map((h) => h.title))];
  const context = hits
    .map((h, i) => `[자료 ${i + 1} · 출처: ${h.title}]\n${h.content}`)
    .join('\n\n---\n\n');
  return { context, sources };
}

/** 조건에 맞는(같은 문서에서 온) 조각을 문서별로 묶어 안 그러면 중복되는 출처를 정리. */
export function uniqueSources(hits: SearchHit[]): string[] {
  return [...new Set(hits.map((h) => h.title))];
}
