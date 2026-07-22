// Phase 0: 네이버 OAuth refresh token 발급 도구 (authorization code flow).
//
// 흐름: localhost 콜백 서버(http://localhost:3000/callback) 기동 → state 포함 authorize URL
//       브라우저 오픈 → 콜백 code 수신 → token 엔드포인트에서 교환 → refresh token 획득.
//
// 보안 규칙(00 규칙 #4):
//   - refresh token 은 화면에 1회만 표시하고 파일에 저장하지 않는다.
//   - client_secret 은 출력하지 않는다.
//   - state 불일치(CSRF) 시 즉시 중단한다.
//
// 실행: node scripts/naver-token.mjs
// 필요 env: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET

import './load-env.mjs';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { requireEnv, AUTHORIZE_URL, exchangeCodeForToken } from './lib/naver.mjs';

const CALLBACK_PORT = 3000;
const CALLBACK_PATH = '/callback';
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;

function mask(token) {
  if (!token) return '(없음)';
  return token.length <= 8 ? '****' : `${token.slice(0, 4)}…${token.slice(-4)}`;
}

// 기본 브라우저로 URL 열기(플랫폼별). 실패해도 URL 을 직접 열 수 있도록 콘솔에 출력해 둔다.
function openBrowser(url) {
  const cmd =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  try {
    spawn(cmd, { shell: true, stdio: 'ignore', detached: true }).unref();
  } catch {
    /* 콘솔에 출력된 URL 로 수동 진행 */
  }
}

// 콜백을 1회 받고 서버를 닫는다. { ok, code, state } 또는 { ok:false, reason } 반환.
function waitForCallback(expectedState) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const u = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
      if (u.pathname !== CALLBACK_PATH) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('not found');
        return;
      }
      const reply = (msg) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          `<html><body style="font-family:sans-serif"><h3>${msg}</h3>` +
            `<p>이 창을 닫고 터미널로 돌아가세요.</p></body></html>`
        );
      };
      const code = u.searchParams.get('code');
      const retState = u.searchParams.get('state');
      const err = u.searchParams.get('error');

      if (err) {
        reply('인증 오류/거부. 터미널을 확인하세요.');
        server.close();
        resolve({ ok: false, reason: `authorize 오류: ${err}` });
      } else if (retState !== expectedState) {
        reply('state 불일치 — 보안상 중단했습니다.');
        server.close();
        resolve({ ok: false, reason: 'state 불일치(CSRF 방어). 즉시 중단.' });
      } else if (!code) {
        reply('code 누락.');
        server.close();
        resolve({ ok: false, reason: 'code 누락' });
      } else {
        reply('인증 코드 수신 완료.');
        server.close();
        resolve({ ok: true, code, state: retState });
      }
    });
    server.on('error', (e) =>
      resolve({ ok: false, reason: `콜백 서버 오류: ${e.message} (포트 ${CALLBACK_PORT} 사용 중일 수 있음)` })
    );
    server.listen(CALLBACK_PORT, () => {
      const state = expectedState;
      const authUrl = `${AUTHORIZE_URL}?${new URLSearchParams({
        response_type: 'code',
        client_id: process.env.NAVER_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        state,
      }).toString()}`;
      console.log('콜백 서버 대기 중 … 브라우저에서 네이버 로그인/동의를 진행하세요.');
      console.log('브라우저가 자동으로 열리지 않으면 아래 URL 을 직접 열으세요:\n');
      console.log(`  ${authUrl}\n`);
      openBrowser(authUrl);
    });
  });
}

async function run() {
  const env = requireEnv(['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET']);

  console.log('\n[사전 조건] 네이버 개발자센터 앱에 아래 Callback URL 이 등록되어 있어야 합니다:');
  console.log(`  ${REDIRECT_URI}\n`);

  const state = randomBytes(16).toString('hex');
  const cb = await waitForCallback(state);
  if (!cb.ok) {
    console.log(`\n❌ 중단: ${cb.reason}`);
    process.exitCode = 1;
    return;
  }

  console.log('\ncode 교환 중 …');
  const tok = await exchangeCodeForToken({
    clientId: env.NAVER_CLIENT_ID,
    clientSecret: env.NAVER_CLIENT_SECRET,
    code: cb.code,
    state: cb.state,
  });

  if (!tok.ok || !tok.refreshToken) {
    console.log(`\n❌ 토큰 교환 실패 (status ${tok.status})`);
    console.log('   응답:', JSON.stringify(tok.raw));
    console.log('   원인 예: Callback URL 미등록/불일치, client_id·secret 오류, 사용자 동의 취소.');
    process.exitCode = 1;
    return;
  }

  console.log('\n✅ refresh token 발급 성공 (아래 값은 이번 1회만 표시됩니다)');
  console.log(`   access_token : ${mask(tok.accessToken)}  (임시 값 — 저장 불필요)`);
  console.log(`   expires_in   : ${tok.expiresIn ?? '(미제공)'} 초`);
  console.log('\n--- NAVER_REFRESH_TOKEN (전체, 복사용) ---');
  console.log(tok.refreshToken);
  console.log('------------------------------------------');
  console.log('\n다음 안내:');
  console.log('   1) 위 refresh token 을 .env 의 NAVER_REFRESH_TOKEN 에 붙여넣기');
  console.log('   2) 동일 값을 비밀번호 금고에도 저장 (05-ASSET-REGISTRY)');
  console.log('   3) 파일로 저장하지 않았습니다. 터미널 히스토리 정리를 권장합니다.\n');
}

run().catch((e) => {
  console.error('\n치명적 오류:', e.message);
  process.exitCode = 1;
});
