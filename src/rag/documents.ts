// 문서(RAG 지식베이스) CRUD + 저장 시 재청킹·재임베딩 파이프라인.
//
// 저장 흐름: 권한 확인 → PII 감지(확인 없으면 차단) → 임베딩(네트워크, 트랜잭션 밖) →
// 트랜잭션(문서 upsert + doc_chunks 통째 교체) → audit.
// 임베딩을 트랜잭션 밖에서 먼저 하는 이유: 외부 API 호출을 DB 트랜잭션 안에 넣으면 커넥션을
// 오래 잡는다. 임베딩이 성공한 뒤에야 짧은 트랜잭션으로 원자적으로 쓴다.
//
// visibility(member|staff|board)는 **챗봇 검색 노출 범위**다. 편집 권한(소유권)과는 별개다:
// 편집은 소유자(개인 본인/소속 팀) + 회장단, 검색 노출은 visibility ≤ 질문자 역할(search.ts).

import { and, desc, eq, inArray, or, type SQL } from 'drizzle-orm';
import type { Db } from '@/db/types';
import { documents, docChunks } from '@/db/schema';
import type { Actor, OwnerType, Role } from '@/auth/permissions';
import { isPrivileged } from '@/auth/permissions';
import { requireAuthorized } from '@/auth/guard';
import { buildAuditEntry, recordAudit } from '@/auth/audit';
import { chunkDocument } from './chunking';
import { embedTexts } from './gemini';
import { detectPii, type PiiFinding } from './pii';

export type Document = typeof documents.$inferSelect;
export type Visibility = Document['visibility'];

export interface DocumentInput {
  title: string;
  contentMd: string;
  visibility: Visibility;
  ownerType: Extract<OwnerType, 'personal' | 'team'>;
  ownerId: string; // personal=userId, team=teamId
  /** PII 경고를 확인하고 그래도 저장하겠다는 명시. false 인데 PII 가 잡히면 저장을 막는다. */
  piiAck?: boolean;
}

/** PII 가 감지됐는데 확인(piiAck)이 없어 저장을 막음. 라우트에서 422 + findings 로 매핑. */
export class PiiBlockedError extends Error {
  readonly status = 422;
  constructor(readonly findings: PiiFinding[]) {
    super('개인정보로 보이는 내용이 있어 저장을 보류했습니다.');
    this.name = 'PiiBlockedError';
  }
}

const ownershipOf = (d: { ownerType: string; ownerId: string }) => ({
  ownerType: d.ownerType as OwnerType,
  ownerId: d.ownerId,
});

/** 제목+본문 → 청크 → 임베딩(RETRIEVAL_DOCUMENT). 네트워크 호출이라 트랜잭션 밖에서 부른다. */
async function embedChunks(title: string, contentMd: string): Promise<{ index: number; content: string; embedding: number[] }[]> {
  const chunks = chunkDocument(title, contentMd);
  if (chunks.length === 0) return [];
  const vectors = await embedTexts(chunks.map((c) => c.content), 'RETRIEVAL_DOCUMENT');
  return chunks.map((c, i) => ({ index: c.index, content: c.content, embedding: vectors[i]! }));
}

async function writeChunks(tx: Db, documentId: string, rows: { index: number; content: string; embedding: number[] }[]): Promise<void> {
  await tx.delete(docChunks).where(eq(docChunks.documentId, documentId)); // 통째 교체(부분 갱신 안 함)
  if (rows.length === 0) return;
  await tx.insert(docChunks).values(
    rows.map((r) => ({ documentId, chunkIndex: r.index, content: r.content, embedding: r.embedding }))
  );
}

export async function createDocument(db: Db, actor: Actor, input: DocumentInput): Promise<Document> {
  requireAuthorized(actor, { kind: 'document.modify', owner: { ownerType: input.ownerType, ownerId: input.ownerId } });

  const findings = detectPii(input.contentMd);
  if (findings.length > 0 && !input.piiAck) throw new PiiBlockedError(findings);

  const chunkRows = await embedChunks(input.title, input.contentMd);

  const doc = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(documents)
      .values({
        title: input.title,
        contentMd: input.contentMd,
        visibility: input.visibility,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        updatedBy: actor.userId,
        piiChecked: findings.length > 0, // PII 를 확인하고 통과시켰다는 기록
      })
      .returning();
    await writeChunks(tx, row!.id, chunkRows);
    return row!;
  });

  await recordAudit(
    db,
    buildAuditEntry({ actorUserId: actor.userId, action: 'document.create', targetTable: 'documents', targetId: doc.id, after: { title: doc.title, visibility: doc.visibility, chunks: chunkRows.length } })
  );
  return doc;
}

export type DocumentPatch = Partial<Pick<DocumentInput, 'title' | 'contentMd' | 'visibility' | 'piiAck'>>;

export async function updateDocument(db: Db, actor: Actor, id: string, patch: DocumentPatch): Promise<Document> {
  const [before] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!before) throw new Error(`document not found: ${id}`);
  requireAuthorized(actor, { kind: 'document.modify', owner: ownershipOf(before) });

  const title = patch.title ?? before.title;
  const contentMd = patch.contentMd ?? before.contentMd;
  const contentChanged = patch.contentMd !== undefined && patch.contentMd !== before.contentMd;
  const titleChanged = patch.title !== undefined && patch.title !== before.title;

  if (contentChanged) {
    const findings = detectPii(contentMd);
    if (findings.length > 0 && !patch.piiAck) throw new PiiBlockedError(findings);
  }

  // 제목·본문이 바뀌면 임베딩을 다시 만든다(문맥 접두에 제목이 들어가므로 제목만 바뀌어도 재색인).
  const chunkRows = titleChanged || contentChanged ? await embedChunks(title, contentMd) : null;

  const doc = await db.transaction(async (tx) => {
    const set: Partial<Document> = { updatedBy: actor.userId, updatedAt: new Date() };
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.contentMd !== undefined) set.contentMd = patch.contentMd;
    if (patch.visibility !== undefined) set.visibility = patch.visibility;
    if (contentChanged) set.piiChecked = detectPii(contentMd).length > 0;
    const [row] = await tx.update(documents).set(set).where(eq(documents.id, id)).returning();
    if (chunkRows) await writeChunks(tx, id, chunkRows);
    return row!;
  });

  await recordAudit(
    db,
    buildAuditEntry({ actorUserId: actor.userId, action: 'document.update', targetTable: 'documents', targetId: id, before: { title: before.title, visibility: before.visibility }, after: { title: doc.title, visibility: doc.visibility, reindexed: chunkRows !== null } })
  );
  return doc;
}

export async function deleteDocument(db: Db, actor: Actor, id: string): Promise<void> {
  const [before] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!before) throw new Error(`document not found: ${id}`);
  requireAuthorized(actor, { kind: 'document.modify', owner: ownershipOf(before) });
  await db.delete(documents).where(eq(documents.id, id)); // doc_chunks 는 FK cascade 로 함께 삭제
  await recordAudit(
    db,
    buildAuditEntry({ actorUserId: actor.userId, action: 'document.delete', targetTable: 'documents', targetId: id, before: { title: before.title } })
  );
}

export interface DocumentRow {
  id: string;
  title: string;
  visibility: Visibility;
  ownerType: string;
  ownerId: string;
  updatedAt: string;
  piiChecked: boolean;
}

/**
 * 관리(편집) 목록 — 편집 권한 스코프로 필터한다(챗봇 검색 스코프와 다름).
 * 회장단·시스템관리자: 전체. 그 외 운영진: 본인 개인 + 소속 팀 문서.
 */
export async function listDocuments(db: Db, actor: Actor): Promise<DocumentRow[]> {
  let where: SQL | undefined;
  if (!isPrivileged(actor.role)) {
    const teamIds = actor.teams.map((t) => t.teamId);
    const conds = [and(eq(documents.ownerType, 'personal'), eq(documents.ownerId, actor.userId))];
    if (teamIds.length) conds.push(and(eq(documents.ownerType, 'team'), inArray(documents.ownerId, teamIds)));
    where = or(...conds);
  }
  const rows = await db.select().from(documents).where(where).orderBy(desc(documents.updatedAt));
  return rows.map((d) => ({
    id: d.id,
    title: d.title,
    visibility: d.visibility,
    ownerType: d.ownerType,
    ownerId: d.ownerId,
    updatedAt: d.updatedAt.toISOString(),
    piiChecked: d.piiChecked,
  }));
}

export async function getDocument(db: Db, id: string): Promise<Document | null> {
  const [row] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return row ?? null;
}

/** 역할 → visibility 순위(검색 필터·목록에서 공용). member<staff<board=sysadmin. */
export const VISIBILITY_RANK: Record<Visibility, number> = { member: 0, staff: 1, board: 2 };
export function roleVisibilityRank(role: Role): number {
  return role === 'member' ? 0 : role === 'staff' ? 1 : 2; // board·sysadmin=2
}
