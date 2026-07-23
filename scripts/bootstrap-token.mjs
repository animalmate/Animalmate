// 최초 토큰 부트스트랩: .env 의 NAVER_REFRESH_TOKEN 을 TOKEN_ENCRYPTION_KEY 로 암호화해
// naver_tokens 테이블에 저장한다. 성공 시 .env 에서 평문 토큰 제거를 안내한다.
//
// 암호화 포맷은 src/crypto/token-cipher.ts 와 동일해야 한다: base64( iv(12) | authTag(16) | ciphertext ),
// aes-256-gcm, 키는 32바이트(hex 64자 또는 base64). 서비스(refreshAndStore)가 이 값을 복호화한다.
//
// 실행: node scripts/bootstrap-token.mjs
// 필요 env: NAVER_REFRESH_TOKEN, TOKEN_ENCRYPTION_KEY, DIRECT_URL(또는 DATABASE_URL)

import './load-env.mjs';
import { createCipheriv, randomBytes } from 'node:crypto';
import postgres from 'postgres';

function decodeKey(raw) {
  const s = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, 'hex');
  const b = Buffer.from(s, 'base64');
  if (b.length === 32) return b;
  throw new Error('TOKEN_ENCRYPTION_KEY 는 32바이트여야 합니다(hex 64자 또는 base64 32바이트).');
}

function encryptToken(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    console.error(`❌ 환경 변수 ${name} 가 필요합니다(.env).`);
    if (name === 'TOKEN_ENCRYPTION_KEY') {
      console.error('   새 키 생성: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
    }
    process.exit(1);
  }
  return v.trim();
}

async function run() {
  const refreshToken = requireEnv('NAVER_REFRESH_TOKEN');
  const key = decodeKey(requireEnv('TOKEN_ENCRYPTION_KEY'));
  const dbUrl = (process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '').trim();
  if (!dbUrl) {
    console.error('❌ DIRECT_URL(또는 DATABASE_URL) 가 필요합니다(.env).');
    process.exit(1);
  }

  const encrypted = encryptToken(refreshToken, key);
  const sql = postgres(dbUrl, { prepare: false, max: 1 });
  try {
    const existing = await sql`select id from naver_tokens limit 1`;
    if (existing.length) {
      await sql`update naver_tokens set refresh_token_encrypted = ${encrypted}, status = 'ok' where id = ${existing[0].id}`;
      console.log('✅ 기존 naver_tokens 행을 갱신했습니다.');
    } else {
      await sql`insert into naver_tokens (refresh_token_encrypted, status) values (${encrypted}, 'ok')`;
      console.log('✅ naver_tokens 에 암호화된 refresh token 을 저장했습니다.');
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log('\n이제 .env 에서 NAVER_REFRESH_TOKEN 을 제거해도 됩니다(값은 비밀번호 금고에 보관).');
  console.log('앱은 naver_tokens 에서 암호화된 토큰을 읽어 자동 갱신합니다.');
}

run().catch((e) => {
  console.error('\n치명적 오류:', e.message);
  process.exitCode = 1;
});
