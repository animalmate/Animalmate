// RAG visibility 강제 — 부원이 staff/board 문서를 검색으로 못 보는지 증명한다(1D DoD 핵심).
//
// 실 DB + 실 임베딩(네트워크)로 파이프라인 전체를 태운다: createDocument(청킹·임베딩·저장) →
// searchChunks(질문 임베딩·코사인·visibility WHERE). 임베딩 호출이 있어 GEMINI_API_KEY 도 필요.

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, like, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { documents, users, auditLogs } from '@/db/schema';
import { createDocument, deleteDocument } from '@/rag/documents';
import { searchChunks, allowedVisibilities } from '@/rag/search';
import type { Actor } from '@/auth/permissions';

const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const HAVE_KEY = !!process.env.GEMINI_API_KEY;
const suite = DIRECT_URL && HAVE_KEY ? describe : describe.skip;

const PREFIX = 'RAGTEST_';
const OWNER_EMAIL = 'ragtest-owner@example.invalid';

suite('RAG visibility — 질문자 역할 이하 문서만 검색된다', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let owner: Actor; // board (전 visibility 문서 생성 권한)
  const docIds: string[] = [];

  async function cleanup() {
    const docs = await db.select({ id: documents.id }).from(documents).where(like(documents.title, `${PREFIX}%`));
    const ids = docs.map((d) => d.id);
    if (ids.length) {
      await db.delete(auditLogs).where(inArray(auditLogs.targetId, ids));
      await db.delete(documents).where(inArray(documents.id, ids)); // doc_chunks cascade
    }
    await db.delete(users).where(eq(users.email, OWNER_EMAIL));
  }

  beforeAll(async () => {
    sql = postgres(DIRECT_URL!, { prepare: false, max: 1 });
    db = drizzle(sql, { schema, casing: 'snake_case' });
    await cleanup();
    const [u] = await db.insert(users).values({ email: OWNER_EMAIL, name: 'RAG오너' }).returning();
    owner = { userId: u!.id, role: 'board', membershipActive: true, teams: [] };

    // 세 등급의 문서를 서로 뚜렷이 다른 주제로 만든다(주제가 겹치면 검증이 흐려진다).
    const seed = [
      { v: 'member' as const, title: `${PREFIX}회비안내`, body: '## 회비\n한 학기 회비는 2만원입니다. 신입 부원도 동일합니다.' },
      { v: 'staff' as const, title: `${PREFIX}팀장매뉴얼`, body: '## 발행\n팀장은 봉사 공지를 예약 큐에서 업로드합니다. 발행 직전 장소·정원이 치환됩니다.' },
      { v: 'board' as const, title: `${PREFIX}예산기밀`, body: '## 예산\n올해 회장단 운영 예산은 오십만원이며 집행 내역은 회장단만 열람합니다.' },
    ];
    for (const s of seed) {
      const d = await createDocument(db, owner, {
        title: s.title,
        contentMd: s.body,
        visibility: s.v,
        ownerType: 'personal',
        ownerId: owner.userId,
      });
      docIds.push(d.id);
    }
  });

  afterAll(async () => {
    for (const id of docIds) await deleteDocument(db, owner, id).catch(() => {});
    await cleanup();
    await sql.end({ timeout: 5 });
  });

  const member: Actor = { userId: 'm', role: 'member', membershipActive: true, teams: [] };
  const staff: Actor = { userId: 's', role: 'staff', membershipActive: true, teams: [] };

  it('allowedVisibilities: 역할별로 볼 수 있는 등급이 누적된다', () => {
    expect(allowedVisibilities(member).sort()).toEqual(['member']);
    expect(allowedVisibilities(staff).sort()).toEqual(['member', 'staff']);
    expect(allowedVisibilities(owner).sort()).toEqual(['board', 'member', 'staff']);
  });

  it('부원 검색: member 문서만, staff/board 문서는 결코 결과에 없다', async () => {
    // 질문이 어느 문서와 가깝든, 부원 결과에는 member 등급만 나와야 한다.
    for (const q of ['회비 얼마예요?', '예산 얼마야?', '팀장 발행 어떻게 해요?']) {
      const hits = await searchChunks(db, member, q);
      expect(hits.every((h) => h.visibility === 'member')).toBe(true);
    }
  });

  it('부원이 staff 문서 주제를 정확히 물어도 그 내용이 새지 않는다(핵심 누출 방지)', async () => {
    const hits = await searchChunks(db, member, '봉사 공지 발행 직전 장소 정원 치환');
    // staff 문서(팀장매뉴얼)가 의미적으로 가장 가깝지만, 부원에겐 안 보여야 한다.
    expect(hits.some((h) => h.title.includes('팀장매뉴얼'))).toBe(false);
    expect(hits.some((h) => h.content.includes('정원이 치환'))).toBe(false);
  });

  it('운영진 검색: member+staff 는 보이고 board(예산기밀)는 안 보인다', async () => {
    const hits = await searchChunks(db, staff, '올해 운영 예산 오십만원 집행');
    expect(hits.some((h) => h.visibility === 'board')).toBe(false);
    expect(hits.some((h) => h.content.includes('오십만원'))).toBe(false);
  });

  it('회장단 검색: board 기밀 문서까지 검색된다', async () => {
    const hits = await searchChunks(db, owner, '올해 운영 예산 집행 내역');
    expect(hits.some((h) => h.title.includes('예산기밀'))).toBe(true);
  });

  it('임베딩·저장 파이프라인이 실제로 조각을 남긴다(스모크)', async () => {
    const hits = await searchChunks(db, owner, '회비 2만원');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.similarity).toBeGreaterThan(0.5);
  });
});
