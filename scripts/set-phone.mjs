// 회원 전화번호 설정(운영용, 시드 아님): 이미 가입한 계정의 users.phone 을 채운다.
// 전화번호는 개인정보라 코드/커밋에 넣지 않는다 — 반드시 실행 인자로만 준다(규칙 #4).
//
// 사용:
//   node scripts/set-phone.mjs --email you@example.com --phone 010-1234-5678
//
// 필요 env: DIRECT_URL(또는 DATABASE_URL).

import './load-env.mjs';
import postgres from 'postgres';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function formatPhone(s) {
  const d = String(s ?? '').replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return d.startsWith('02') ? `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return String(s ?? '').trim();
}

async function run() {
  const dbUrl = (process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '').trim();
  if (!dbUrl) { console.error('❌ DIRECT_URL(또는 DATABASE_URL) 필요'); process.exit(1); }
  const email = (arg('--email') ?? '').trim().toLowerCase();
  const phoneRaw = (arg('--phone') ?? '').trim();
  if (!email || !phoneRaw) { console.error('사용법: --email <email> --phone <번호>'); process.exit(1); }
  const digits = phoneRaw.replace(/\D/g, '');
  if (!(digits.length >= 9 && digits.length <= 11 && digits.startsWith('0'))) {
    console.error(`❌ 전화번호 형식이 올바르지 않음: ${phoneRaw}`); process.exit(1);
  }
  const phone = formatPhone(phoneRaw);

  const sql = postgres(dbUrl, { prepare: false, max: 1 });
  try {
    const rows = await sql`update users set phone = ${phone} where email = ${email} returning id`;
    if (rows.length === 0) { console.error(`❌ 사용자 없음: ${email} — 먼저 가입해야 합니다.`); process.exit(1); }
    console.log(`✅ ${email} 전화번호 설정 완료(${phone}).`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

run().catch((e) => { console.error('\n오류:', e.message); process.exitCode = 1; });
