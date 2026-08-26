// docs/rag/*.md → 챗봇 지식베이스(documents) 동기화. 제목이 같은 문서가 있으면 교체한다.
//
// 왜 스크립트인가: 이 폴더의 마크다운은 리포에 있는 것만으로는 챗봇이 읽지 않는다(README).
// 손으로 `/documents` 에 붙여넣는 동안 **공개 범위를 잘못 고르는 것**이 가장 무서운 실수다 —
// 회장단 문서를 staff 로 올리면 운영진 전원에게 새고, 되돌려도 이미 읽힌 뒤다.
// 표를 코드에 박아 두면 그 실수가 구조적으로 사라진다.
//
// 사용:
//   npx tsx --conditions=react-server scripts/sync-rag-docs.ts --actor <이메일 또는 userId>          (미리보기)
//   npx tsx --conditions=react-server scripts/sync-rag-docs.ts --actor <이메일 또는 userId> --apply  (실제 저장)
//   ... --only 01        (파일 이름에 '01' 이 들어간 것만)
//   ... --audit          (저장된 문서 전체를 PII 탐지기로 재검사. 읽기 전용, 본문 미출력)
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
import { documents, users } from '@/db/schema';
import { createDocument, updateDocument, type Visibility } from '@/rag/documents';
import { loadActor } from '@/auth/auth-service';
import { detectPii } from '@/rag/pii';
import { isPrivileged } from '@/auth/permissions';
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
  console.error('❌ --actor <이메일 또는 userId> (또는 RAG_ACTOR_ID) 필요 — 회장단·시스템관리자 계정이어야 합니다.');
  process.exit(1);
}

const sql = postgres((process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '').trim(), { prepare: false, max: 1 });
const db = drizzle(sql, { schema, casing: 'snake_case' });

/**
 * `--actor` 를 실제 계정으로 해석한다. **이메일도 받는다** — 회장단 UUID 를 어디서 구하는지가
 * 이 스크립트를 돌리는 데 가장 큰 걸림돌이었고, 사람이 아는 값은 이메일이다.
 *
 * 역할은 **DB 에서 읽는다.** 예전에는 `{ role: 'sysadmin' }` 을 그냥 지어내서 넘겼는데,
 * 그러면 `requireAuthorized(document.modify)` 가 그 가짜 값을 보고 늘 통과한다 — 즉 아무 UUID 나
 * 넣어도 문서가 저장되고, `documents.updated_by` 와 감사 로그에 **그 사람이 한 것처럼** 남는다.
 * 권한의 진실은 DB 라는 원칙(auth-service.loadActor)을 스크립트만 비껴가고 있었다.
 */
async function resolveActor(ref: string): Promise<Actor> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref.trim());
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(isUuid ? eq(users.id, ref.trim()) : eq(users.email, ref.trim().toLowerCase()))
    .limit(1);
  if (!row) throw new Error(`그런 계정이 없습니다: ${ref}`);

  const loaded = await loadActor(db, row.id);
  if (!loaded) throw new Error(`계정을 읽지 못했습니다(탈퇴했거나 세션 세대가 어긋남): ${row.email}`);
  if (!isPrivileged(loaded.role)) {
    throw new Error(
      `${row.email} 은(는) '${loaded.role}' 입니다. 지식베이스 문서는 회장단·시스템관리자만 고칠 수 있습니다.`
    );
  }
  console.log(`👤 ${row.name} <${row.email}> · ${loaded.role}\n`);
  return loaded;
}

const actor: Actor = await resolveActor(actorId);

/**
 * `--audit` — 지식베이스에 **이미 저장된** 문서 전부를 PII 탐지기로 다시 훑는다(읽기 전용).
 *
 * 왜 필요한가: 저장 시점의 경고는 그때의 탐지기 성능이 전부다. 2026-08-26 에 계좌번호 패턴이
 * `g` 플래그 때문에 **호출을 걸러 가며 놓치던 버그**를 고쳤는데(`rag/pii.ts`), 그 전에 저장된
 * 문서는 망가진 탐지기로 검사된 상태다. 게다가 PII 경고는 차단이 아니라 확인 후 통과라
 * (`documents/panel.tsx` "그래도 저장"), 사람이 넘긴 것도 있을 수 있다.
 * 규칙 #5 는 "PII 를 RAG 인덱스에 넣지 않는다" 인데, 지금까지 **넣은 뒤에 확인할 방법이 없었다.**
 *
 * 본문은 찍지 않는다 — 확인하려고 돌리는 도구가 PII 를 터미널·로그에 뿌리면 본말전도다.
 * 마스킹된 예시와 어느 문서인지만 알려 주고, 실제 내용은 `/documents` 에서 보게 한다.
 */
async function auditStoredDocuments(): Promise<void> {
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      visibility: documents.visibility,
      contentMd: documents.contentMd,
      piiChecked: documents.piiChecked,
      kind: documents.kind,
      updatedAt: documents.updatedAt,
    })
    .from(documents);

  console.log(`지식베이스 문서 ${rows.length}건 재검사 (본문은 출력하지 않습니다)\n`);
  let flagged = 0;
  for (const r of rows) {
    const findings = detectPii(r.contentMd);
    const head = `[${r.visibility.padEnd(6)}] ${r.title} · ${r.contentMd.length}자 · ${r.kind}`;
    if (findings.length === 0) {
      console.log(`✅ ${head}`);
      continue;
    }
    flagged += 1;
    console.log(`⚠️  ${head}`);
    for (const f of findings) console.log(`      · ${f.label} (${f.sample})`);
    // 저장 당시 사람이 경고를 보고 넘겼는지 구분한다 — 넘긴 것과 탐지기가 놓친 것은 다른 문제다.
    console.log(`      저장 당시 확인 표시: ${r.piiChecked ? '있음(사람이 보고 통과시킴)' : '없음(그때는 안 걸렸음)'}`);
  }
  console.log(
    flagged === 0
      ? '\n개인정보로 보이는 내용이 있는 문서는 없습니다.'
      : `\n${flagged}건에서 개인정보 패턴이 보입니다. /documents 에서 내용을 확인하세요.`
  );
}

if (process.argv.includes('--audit')) {
  try {
    await auditStoredDocuments();
  } finally {
    await sql.end();
  }
  process.exit(0);
}

/** 이번 실행이 손댄(= PLAN 이 관리하는) 문서 id. 아래 `reportUnmanaged` 가 나머지를 가려낸다. */
const managedIds = new Set<string>();

/**
 * PLAN 밖에 있는 손글씨 문서를 알린다.
 *
 * 왜 필요한가: 이 스크립트는 **제목으로** 짝을 찾는다(`documents.title` 에 unique 제약도 없다).
 * 그래서 누가 `/documents` 화면에서 관리 문서의 **제목을 한 글자만 고치면**, 다음 동기화가
 * 교체가 아니라 **새 문서를 만든다.** 옛 문서는 그대로 남아 챗봇이 같은 안내를 두 벌 검색하고,
 * 그중 하나는 영영 낡은 내용이다. 조용히 일어나고 아무도 모른다는 것이 이 사고의 성질이다.
 *
 * 제목을 안정적인 키(slug)로 바꾸는 것이 근본 해법이지만, 실제 피해는 **중복·낡은 내용**이지
 * 공개 범위 유출이 아니다(이름이 바뀐 옛 문서는 원래 범위를 그대로 들고 있다). 스키마를 늘리는
 * 대신 **드리프트를 보이게** 만든다 — 다음 동기화 때 반드시 눈에 띄면 조용한 사고가 아니게 된다.
 *
 * 가이드북에서 뽑아낸 본문(kind='guidebook')은 손글씨가 아니므로 제외한다.
 */
async function reportUnmanaged(): Promise<void> {
  const rows = await db
    .select({ id: documents.id, title: documents.title, visibility: documents.visibility, updatedAt: documents.updatedAt })
    .from(documents)
    .where(eq(documents.kind, 'manual'));
  const strays = rows.filter((r) => !managedIds.has(r.id));
  if (strays.length === 0) return;

  console.log(`\n⚠  PLAN 에 없는 손글씨 문서 ${strays.length}건 — 챗봇이 이것도 검색합니다.`);
  for (const s of strays) {
    console.log(`   · [${s.visibility}] ${s.title} (수정 ${s.updatedAt.toISOString().slice(0, 10)}) id=${s.id}`);
  }
  console.log(
    '   관리 문서의 **제목을 화면에서 고치면** 여기 옛 문서로 남고 새 문서가 따로 생깁니다.\n' +
      '   의도한 문서가 아니면 /documents 에서 지우세요.'
  );
}

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
    if (existing) managedIds.add(existing.id);

    if (!apply) {
      // **드리프트를 눈에 보이게 한다.** 파일을 고쳐 커밋해도 올리지 않으면 챗봇은 옛 내용을
      // 계속 답한다 — 그런데 예전 미리보기는 "교체" 라고만 해서, 올릴 것이 있는지 없는지
      // 구분이 안 됐다. 무엇이 어떻게 다른지까지 말해 준다.
      const sameContent = existing?.contentMd === contentMd;
      const sameVis = existing?.visibility === p.visibility;
      const diff = !existing
        ? '새로 올린다'
        : sameContent && sameVis
          ? '이미 최신 — 올릴 것 없음'
          : [
              sameContent ? null : `본문 다름(DB ${existing.contentMd.length}자 → 파일 ${contentMd.length}자)`,
              sameVis ? null : `공개범위 다름(DB ${existing.visibility} → ${p.visibility})`,
            ]
              .filter(Boolean)
              .join(', ');
      console.log(`[미리보기] ${verb} · ${p.visibility.padEnd(6)} · ${p.title} — ${diff}`);
      continue;
    }

    const doc = existing
      ? await updateDocument(db, actor, existing.id, { title: p.title, contentMd, visibility: p.visibility })
      : await createDocument(db, actor, {
          title: p.title,
          contentMd,
          visibility: p.visibility,
          ownerType: 'personal',
          // 이메일로 부를 수 있게 된 뒤로 actorId 는 UUID 가 아닐 수 있다 — 해석된 값을 쓴다.
          ownerId: actor.userId,
        });
    managedIds.add(doc.id);
    console.log(`✅ ${verb} · ${doc.visibility} · ${doc.title} · id=${doc.id}`);
  }

  await reportUnmanaged();
  if (!apply) console.log('\n(미리보기입니다. 실제로 저장하려면 --apply 를 붙이세요.)');
} finally {
  await sql.end();
}
