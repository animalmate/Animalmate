#!/usr/bin/env node
// 테스트 DB 를 **빈 스키마 + 최신 마이그레이션** 상태로 되돌린다.
//
//   npm run db:reset:test
//
// 왜 필요한가: `db:migrate:test`(drizzle-kit migrate)는 **자가 복구를 하지 못한다.**
// 마이그레이션 적용 기록은 `drizzle` 스키마에 있고 테이블은 `public` 에 있어서, 둘의 상태가
// 어긋나면 migrate 가 "전부 적용됨"으로 보고 **아무것도 하지 않고 통과**한다. 그러고 나서
// 테스트만 `relation "users" does not exist` 로 죽는다 — 원인을 짐작하기 어려운 실패다.
//
// 실제로 2026-07-28 복원 리허설 중에 겪었다. `drop schema public cascade` 로 테이블만 날아가고
// drizzle 기록이 남아, CI 두 번이 이 상태에서 깨졌다.
//
// 이 스크립트는 **둘을 함께** 지우고 다시 만든다. 어긋난 상태에서 부를 수 있는 유일한 복구 명령이다.
//
// 쓰는 때:
//  - CI/로컬 통합 테스트가 `relation ... does not exist` 로 깨질 때
//  - 복원 리허설이 끝난 뒤(운영 PII 를 지우고 원래대로 되돌릴 때)
//  - 테스트 DB 상태가 의심스러울 때 — 언제 돌려도 안전하다. 테스트 DB 에 보존할 데이터는 없다.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import postgres from 'postgres';
import './load-env.mjs';

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error('\n✖ TEST_DATABASE_URL 이 없습니다. .env 를 확인하세요.\n');
  process.exit(1);
}

/** Supabase 프로젝트 ref. 운영과 테스트는 호스트도 DB 이름도 같아 **ref 로만 구분된다.** */
function projectRef(u) {
  try {
    const parsed = new URL(u);
    const pooler = /^postgres\.([a-z0-9]{16,})$/.exec(decodeURIComponent(parsed.username));
    if (pooler) return pooler[1];
    const direct = /^db\.([a-z0-9]{16,})\.supabase\.co$/.exec(parsed.hostname);
    if (direct) return direct[1];
    return null;
  } catch {
    return null;
  }
}

const target = projectRef(url);
const prod = [process.env.DATABASE_URL, process.env.DIRECT_URL]
  .filter(Boolean)
  .map(projectRef)
  .filter(Boolean);

if (target && prod.includes(target)) {
  console.error(
    '\n✖ TEST_DATABASE_URL 이 **운영 프로젝트**를 가리키고 있습니다. 이 스크립트는 스키마를 통째로\n' +
      '  지웁니다 — 운영이면 전 데이터가 사라집니다. 중단합니다.\n'
  );
  process.exit(1);
}

console.log(`대상: ${target ? `supabase:${target}` : url.replace(/:[^:@]*@/, ':***@')} (운영 아님 확인)`);

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
try {
  console.log('public·drizzle 스키마를 지웁니다…');
  await sql.unsafe('drop schema if exists public cascade; drop schema if exists drizzle cascade;');
  // 마이그레이션은 public 이 **있다고 전제**한다(0000 이 CREATE SCHEMA 를 하지 않는다).
  // 지우고 다시 만들지 않으면 get_namespace_oid 오류로 죽는다.
  await sql.unsafe('create schema public;');
  console.log('빈 public 스키마 생성 완료');
} finally {
  await sql.end();
}

console.log('\n마이그레이션을 적용합니다…');
// npx 를 거치지 않고 drizzle-kit 의 진입점을 node 로 직접 부른다.
// 이유: Windows 에서 npx 는 `npx.cmd` 인데, Node 20.12+ 는 보안 수정(CVE-2024-27980) 이후
// `.cmd`/`.bat` 을 shell:true 없이 실행하지 않는다. 그렇다고 shell:true 로 인자를 넘기면
// 이번엔 "인자가 이스케이프되지 않는다"고 경고한다. 진입점을 직접 부르면 둘 다 피한다.
const bin = fileURLToPath(new URL('../node_modules/drizzle-kit/bin.cjs', import.meta.url));
const r = spawnSync(process.execPath, [bin, 'migrate', '--config', 'drizzle.test.config.ts'], {
  stdio: 'inherit',
});
if (r.status !== 0) {
  console.error('\n✖ 마이그레이션 실패. 위 출력을 확인하세요.\n');
  process.exit(1);
}
console.log('\n✔ 테스트 DB 를 빈 스키마 + 최신 마이그레이션 상태로 되돌렸습니다.');
