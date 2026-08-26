// docs/rag/*.md → 챗봇 지식베이스(documents) 동기화. 제목이 같은 문서가 있으면 교체한다.
//
// 왜 스크립트인가: 이 폴더의 마크다운은 리포에 있는 것만으로는 챗봇이 읽지 않는다(README).
// 손으로 `/documents` 에 붙여넣는 동안 **공개 범위를 잘못 고르는 것**이 가장 무서운 실수다 —
// 회장단 문서를 staff 로 올리면 운영진 전원에게 새고, 되돌려도 이미 읽힌 뒤다.
// 표를 코드에 박아 두면 그 실수가 구조적으로 사라진다.
//
// 사용:
//   npx tsx --conditions=react-server scripts/sync-rag-docs.ts --actor <userId>          (미리보기)
//   npx tsx --conditions=react-server scripts/sync-rag-docs.ts --actor <userId> --apply  (실제 저장)
//   ... --only 01        (파일 이름에 '01' 이 들어간 것만)
//
// `--conditions=react-server` 가 필요한 이유: `@/rag/gemini` 가 'server-only' 를 import 한다.
// 이 조건이 없으면 그 패키지가 "클라이언트에서 부르지 마라" 에러를 던진다.
//
// 필요 env: DIRECT_URL(또는 DATABASE_URL), GEMINI_API_KEY(임베딩).
// actor 는 **회장단·시스템관리자**여야 한다(document.modify).
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { documents } from '@/db/schema';
import { createDocument, updateDocument, type Visibility } from '@/rag/documents';
import type { Actor } from '@/auth/permissions';

/**
 * docs/rag/README.md 의 표 그대로. **공개 범위는 여기서만 정한다.**
 *   member → 부원 이상 전부
 *   staff  → 운영진·회장단만(부원에게는 검색되지 않는다)
 *   board  → 회장단·시스템관리자만(운영진에게도 검색되지 않는다)
 */
const PLAN: { file: string; title: string; visibility: Visibility }[] = [
  { file: 'docs/rag/01-site-guide-member.md', title: '홈페이지 사용 안내 (부원)', visibility: 'member' },
  { file: 'docs/rag/02-site-guide-staff.md', title: '홈페이지 사용 안내 (운영진)', visibility: 'staff' },
  { file: 'docs/rag/03-site-guide-board.md', title: '홈페이지 사용 안내 (회장단)', visibility: 'board' },
];

const argOf = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const actorId = argOf('--actor') ?? process.env.RAG_ACTOR_ID;
const apply = process.argv.includes('--apply');
// 한 문서만 올리고 싶을 때. 내용이 같으면 재임베딩은 어차피 건너뛰지만(updateDocument),
// 손대지 않은 문서의 updated_at 과 감사 로그까지 흔들 이유는 없다.
const only = argOf('--only');

if (!actorId) {
  console.error('❌ --actor <userId> (또는 RAG_ACTOR_ID) 필요 — 회장단·시스템관리자 계정이어야 합니다.');
  process.exit(1);
}

const sql = postgres((process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '').trim(), { prepare: false, max: 1 });
const db = drizzle(sql, { schema, casing: 'snake_case' });
// 권한 판단에 쓰이는 값은 role 뿐이다. 실제 차단은 requireAuthorized 가 한다.
const actor: Actor = { userId: actorId, role: 'sysadmin', membershipActive: true, teams: [] };

try {
  for (const p of PLAN) {
    if (only && !p.file.includes(only)) continue;
    let contentMd: string;
    try {
      contentMd = readFileSync(p.file, 'utf8');
    } catch {
      console.log(`⏭  건너뜀 · ${p.file} 없음`);
      continue;
    }

    const [existing] = await db.select().from(documents).where(eq(documents.title, p.title)).limit(1);
    const verb = existing ? '교체' : '신규';

    if (!apply) {
      console.log(`[미리보기] ${verb} · ${p.visibility.padEnd(6)} · ${p.title} (${contentMd.length}자)`);
      continue;
    }

    const doc = existing
      ? await updateDocument(db, actor, existing.id, { title: p.title, contentMd, visibility: p.visibility })
      : await createDocument(db, actor, {
          title: p.title,
          contentMd,
          visibility: p.visibility,
          ownerType: 'personal',
          ownerId: actorId,
        });
    console.log(`✅ ${verb} · ${doc.visibility} · ${doc.title} · id=${doc.id}`);
  }
  if (!apply) console.log('\n(미리보기입니다. 실제로 저장하려면 --apply 를 붙이세요.)');
} finally {
  await sql.end();
}
