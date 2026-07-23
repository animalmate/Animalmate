// 인증 부트스트랩(시드 아님, 최초 1회 인프라 초기화):
//  1) 최초 가입코드 발급 — 아무도 가입 못 하는 닭-달걀 해소.
//  2) 가입한 사용자를 회장단/시스템관리자로 승격 — 최초 관리자 지정.
//
// 사용:
//   node scripts/bootstrap-admin.mjs --code WELCOME26 --semester 2026-1
//   node scripts/bootstrap-admin.mjs --promote you@example.com [--role sysadmin|board]
//
// 필요 env: DIRECT_URL(또는 DATABASE_URL).

import './load-env.mjs';
import postgres from 'postgres';

const SYSTEM_EMAIL = 'system@animalmate.local';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function run() {
  const dbUrl = (process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '').trim();
  if (!dbUrl) {
    console.error('❌ DIRECT_URL(또는 DATABASE_URL) 필요');
    process.exit(1);
  }
  const code = arg('--code');
  const semester = arg('--semester');
  const promote = arg('--promote');
  const role = arg('--role') ?? 'sysadmin';
  if (!code && !promote) {
    console.log('사용법:\n  --code <CODE> --semester <label>   (최초 가입코드)\n  --promote <email> [--role sysadmin|board]   (관리자 승격)');
    process.exit(0);
  }

  const sql = postgres(dbUrl, { prepare: false, max: 1 });
  try {
    if (code) {
      if (!semester) { console.error('❌ --code 에는 --semester 도 필요'); process.exit(1); }
      // created_by FK 용 시스템 사용자 보장(멤버십 없음 — 실사용자 아님).
      const [sys] = await sql`
        insert into users (email, name) values (${SYSTEM_EMAIL}, 'system')
        on conflict (email) do update set name = excluded.name returning id`;
      const CODE = code.toUpperCase();
      await sql.begin(async (tx) => {
        await tx`update join_codes set is_active = false where is_active = true`;
        await tx`insert into join_codes (code, semester_label, is_active, created_by)
                 values (${CODE}, ${semester}, true, ${sys.id})`;
      });
      console.log(`✅ 활성 가입코드 발급: ${CODE} (학기 ${semester}). 이 코드로 가입하세요.`);
    }

    if (promote) {
      const email = promote.trim().toLowerCase();
      const [u] = await sql`select id from users where email = ${email} limit 1`;
      if (!u) { console.error(`❌ 사용자 없음: ${email} — 먼저 가입한 뒤 승격하세요.`); process.exit(1); }
      const today = new Date().toISOString().slice(0, 10);
      const termEnd = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
      const [m] = await sql`select id from memberships where user_id = ${u.id} and status = 'active' limit 1`;
      if (m) {
        await sql`update memberships set role = ${role} where id = ${m.id}`;
      } else {
        await sql`insert into memberships (user_id, role, term_start, term_end, status)
                  values (${u.id}, ${role}, ${today}, ${termEnd}, 'active')`;
      }
      console.log(`✅ ${email} → ${role} 승격 완료(활성 멤버십). 다시 로그인하면 관리 메뉴가 보입니다.`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

run().catch((e) => { console.error('\n오류:', e.message); process.exitCode = 1; });
