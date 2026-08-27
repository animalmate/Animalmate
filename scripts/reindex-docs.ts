// 챗봇 지식베이스 **재색인** — 본문은 그대로 두고 조각(doc_chunks)만 다시 만든다.
//
//   npx tsx --conditions=react-server scripts/reindex-docs.ts --actor <이메일 또는 userId>          (미리보기)
//   npx tsx --conditions=react-server scripts/reindex-docs.ts --actor <이메일 또는 userId> --apply  (실제 재색인)
//   ... --only "33기 동아리 기본 정보"    (한 문서만)
//
// 언제 쓰나: **청킹·임베딩 규칙을 바꿨을 때.** `updateDocument` 는 제목·본문이 바뀌었을 때만
// 재색인하므로, 규칙만 고치면 이미 저장된 문서는 옛 조각을 그대로 들고 있다. 화면에서 저장을
// 다시 눌러도 소용없다(내용이 같으면 건너뛴다). 그 사각지대를 메우는 도구다.
//
// 2026-08-28 에 실제로 필요했다: 제목 없는 `##` 구분선을 섹션 경계로 인정하도록 청킹을 고쳤는데
// (`rag/chunking.ts`), 정작 그 규칙이 필요한 `33기 동아리 기본 정보` 는 982자짜리 잡탕 조각을
// 그대로 들고 있어 "회비는 얼마예요?" 가 계속 핸드오프됐다.
//
// actor 는 **회장단·시스템관리자**여야 한다(document.modify). 역할은 DB 에서 확인한다 —
// 지어낸 actor 를 넘기면 권한 검사가 늘 통과하고 감사 로그에 남의 이름이 남는다.
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { count, eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { docChunks, documents, users } from '@/db/schema';
import { reindexDocument } from '@/rag/documents';
import { chunkDocument } from '@/rag/chunking';
import { loadActor } from '@/auth/auth-service';
import { isPrivileged } from '@/auth/permissions';
import type { Actor } from '@/auth/permissions';

const argOf = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const actorRef = argOf('--actor') ?? process.env.RAG_ACTOR_ID;
const apply = process.argv.includes('--apply');
const only = argOf('--only');

if (!actorRef) {
  console.error('❌ --actor <이메일 또는 userId> (또는 RAG_ACTOR_ID) 필요 — 회장단·시스템관리자 계정이어야 합니다.');
  process.exit(1);
}

const sql = postgres((process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '').trim(), { prepare: false, max: 1 });
const db = drizzle(sql, { schema, casing: 'snake_case' });

async function resolveActor(ref: string): Promise<Actor> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref.trim());
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(isUuid ? eq(users.id, ref.trim()) : eq(users.email, ref.trim().toLowerCase()))
    .limit(1);
  if (!row) throw new Error(`그런 계정이 없습니다: ${ref}`);
  const loaded = await loadActor(db, row.id);
  if (!loaded) throw new Error(`계정을 읽지 못했습니다: ${row.email}`);
  if (!isPrivileged(loaded.role)) {
    throw new Error(`${row.email} 은(는) '${loaded.role}' 입니다. 지식베이스는 회장단·시스템관리자만 고칠 수 있습니다.`);
  }
  console.log(`👤 ${row.name} <${row.email}> · ${loaded.role}\n`);
  return loaded;
}

const actor = await resolveActor(actorRef);

const docRows = await db
  .select({
    id: documents.id,
    title: documents.title,
    visibility: documents.visibility,
    contentMd: documents.contentMd,
    kind: documents.kind,
  })
  .from(documents)
  .orderBy(documents.title);

// 현재 조각 수는 **따로 센다.** 상관 서브쿼리로 붙였더니 값이 전부 0 으로 들어와, 바뀌는 게
// 하나뿐인데 4건이라고 말하는 미리보기가 됐다 — 미리보기가 틀리면 --apply 를 눌러도 되는지
// 판단할 근거가 사라진다.
const counted = await db
  .select({ documentId: docChunks.documentId, n: count() })
  .from(docChunks)
  .groupBy(docChunks.documentId);
const chunkCount = new Map(counted.map((c) => [c.documentId, Number(c.n)]));
const rows = docRows.map((d) => ({ ...d, chunks: chunkCount.get(d.id) ?? 0 }));

const targets = only ? rows.filter((r) => r.title === only) : rows;
if (only && targets.length === 0) {
  console.error(`❌ 그런 제목의 문서가 없습니다: ${only}`);
  console.error(`   있는 문서: ${rows.map((r) => r.title).join(' / ')}`);
  await sql.end();
  process.exit(1);
}

console.log(`문서 ${targets.length}건${only ? ` (--only "${only}")` : ''}\n`);

let changed = 0;
for (const doc of targets) {
  // 미리보기는 **지금 코드로 다시 잘라 보기만** 한다(임베딩 호출 없음 — 돈이 든다).
  const next = chunkDocument(doc.title, doc.contentMd);
  const diff = next.length - doc.chunks;
  const mark = diff === 0 ? '  =' : ' ▲';
  console.log(`${mark} ${doc.title}  [${doc.visibility}]  조각 ${doc.chunks} → ${next.length}${diff === 0 ? ' (그대로)' : ` (${diff > 0 ? '+' : ''}${diff})`}`);
  if (diff !== 0) changed += 1;

  if (apply) {
    const r = await reindexDocument(db, actor, doc.id);
    console.log(`     ↳ 재색인 완료: ${r.before} → ${r.after}`);
  }
}

console.log(
  `\n조각 수가 달라지는 문서: ${changed}건.` +
    (apply
      ? ' 재색인을 마쳤습니다.'
      : '\n(미리보기입니다. 실제로 재색인하려면 --apply 를 붙이세요 — 임베딩 API 를 호출합니다.)') +
    '\n⚠ 조각 수가 같아도 내용 경계는 달라질 수 있습니다. 규칙을 바꿨다면 --apply 로 다시 만드세요.'
);

await sql.end();
