// Phase 0: 네이버 refresh token 갱신 플로우 검증.
//
// 04-TODO Phase 0: "refresh token 갱신 플로우 검증 (만료 유도 후 자동 갱신 성공)"
// 이 스크립트는 refresh_token 으로 새 access_token 을 발급받아 출력한다.
// 발급된 access_token 을 .env(NAVER_ACCESS_TOKEN)에 넣고 verify-cafe-write.mjs 를 돌리면
//   "만료 → 갱신 → 글쓰기 성공" 전체 사이클이 검증된다.
//
// 실행: node scripts/refresh-cafe-token.mjs
// 필요 env: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, NAVER_REFRESH_TOKEN
//
// 보안: 출력된 토큰은 로그/터미널 히스토리에 남는다. 검증용으로만 쓰고,
//       실제 운영에서는 naver_tokens 테이블에 암호화 저장(02-TECH-STACK §4)한다.

import './load-env.mjs';
import { requireEnv, refreshAccessToken } from './lib/naver.mjs';

function mask(token) {
  if (!token) return '(없음)';
  return token.length <= 8 ? '****' : `${token.slice(0, 4)}…${token.slice(-4)}`;
}

async function run() {
  const env = requireEnv(['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'NAVER_REFRESH_TOKEN']);
  console.log('\nrefresh token 갱신 시도 …');

  const r = await refreshAccessToken({
    clientId: env.NAVER_CLIENT_ID,
    clientSecret: env.NAVER_CLIENT_SECRET,
    refreshToken: env.NAVER_REFRESH_TOKEN,
  });

  if (!r.ok || !r.accessToken) {
    console.log(`\n❌ 갱신 실패 (status ${r.status})`);
    console.log('   응답:', JSON.stringify(r.raw));
    console.log('   원인 예: refresh_token 만료/폐기, client_id·secret 불일치, 봇 계정 재동의 필요.');
    process.exitCode = 1;
    return;
  }

  console.log('\n✅ 갱신 성공');
  console.log(`   access_token : ${mask(r.accessToken)}  (전체 값은 아래 안내대로 .env 에 반영)`);
  console.log(`   expires_in   : ${r.expiresIn ?? '(미제공)'} 초`);
  if (r.refreshToken) {
    console.log(`   refresh_token: ${mask(r.refreshToken)}  (재발급됨 — 최신 값으로 교체 저장할 것)`);
  } else {
    console.log('   refresh_token: 재발급 없음 (기존 값 유지)');
  }

  console.log('\n다음 단계:');
  console.log('   1) 아래 access_token 을 .env 의 NAVER_ACCESS_TOKEN 에 붙여넣기');
  console.log('   2) node scripts/verify-cafe-write.mjs 실행 → 글쓰기까지 end-to-end 확인');
  console.log('\n--- 복사용(access_token 전체) ---');
  console.log(r.accessToken);
  if (r.refreshToken) {
    console.log('--- 복사용(refresh_token 전체, 재발급됨) ---');
    console.log(r.refreshToken);
  }
  console.log('----------------------------------\n');
}

run().catch((e) => {
  console.error('\n치명적 오류:', e.message);
  process.exitCode = 1;
});
