// Phase 0 GO/NO-GO 게이트: 네이버 카페 글쓰기 API 실호출 검증 (3케이스).
//
// 04-TODO Phase 0 DoD: 테스트 게시판에 실제 글 3건 게시 + 응답의 글 URL 확보
//   시작 시 refresh token 으로 access token 을 갱신한 뒤 순차 게시:
//   ① 텍스트만  ② 이미지 1장  ③ 이미지 2장(multipart, image 파라미터 반복)
//   ※ 제목 접두사 "[API 테스트-삭제예정] " + 타임스탬프, 본문에 한글 포함(UTF-8 인코딩 검증 겸용).
//
// 실행: node scripts/verify-cafe-write.mjs
// 필요 env: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, NAVER_REFRESH_TOKEN,
//           NAVER_CAFE_CLUB_ID, NAVER_TEST_MENUID
//
// 제약: 글쓰기 호출은 정확히 3회, 재시도 없음(검증 목적). 카페 API 는 삭제가 불가하므로
//       반드시 "테스트 게시판"에서만 실행하고, 게시된 글은 사람이 직접 삭제한다.

import './load-env.mjs';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import {
  requireEnv,
  refreshAccessToken,
  postArticleText,
  postArticleWithImages,
} from './lib/naver.mjs';
import { solidColorPng } from './lib/png.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, 'fixtures');

// scripts/fixtures/ 에 단색 PNG 를 준비(없으면 생성). [redPath, bluePath] 반환.
function ensureFixtures() {
  if (!existsSync(fixturesDir)) mkdirSync(fixturesDir, { recursive: true });
  const specs = [
    { name: 'solid-red.png', color: [220, 53, 69] },
    { name: 'solid-blue.png', color: [13, 110, 253] },
  ];
  return specs.map(({ name, color }) => {
    const p = join(fixturesDir, name);
    if (!existsSync(p)) writeFileSync(p, solidColorPng(64, 64, color));
    return p;
  });
}

function loadImage(p) {
  return { filename: basename(p), bytes: new Uint8Array(readFileSync(p)), contentType: 'image/png' };
}

function stamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

// HTTP 상태 → 원인 해석(운영진이 바로 조치할 수 있도록).
function interpret(status) {
  if (status === 401) return '토큰 문제(만료/무효) — refresh token 재발급 필요할 수 있음';
  if (status === 403) return '카페 미가입 / 등급 부족 / 대상 게시판 쓰기 권한 없음';
  if (status === 404) return 'clubid 또는 menuid 오류';
  return '기타 오류 — 아래 응답 원문 확인';
}

async function run() {
  const env = requireEnv([
    'NAVER_CLIENT_ID',
    'NAVER_CLIENT_SECRET',
    'NAVER_REFRESH_TOKEN',
    'NAVER_CAFE_CLUB_ID',
    'NAVER_TEST_MENUID',
  ]);

  console.log('\naccess token 갱신 중 …');
  const tok = await refreshAccessToken({
    clientId: env.NAVER_CLIENT_ID,
    clientSecret: env.NAVER_CLIENT_SECRET,
    refreshToken: env.NAVER_REFRESH_TOKEN,
  });
  if (!tok.ok || !tok.accessToken) {
    console.log(`❌ 토큰 갱신 실패 (status ${tok.status}) — 응답:`, JSON.stringify(tok.raw));
    console.log('   글쓰기 검증을 진행할 수 없습니다. naver-token 으로 refresh token 재발급이 필요할 수 있습니다.');
    process.exitCode = 1;
    return;
  }
  console.log('✅ access token 확보\n');

  const base = {
    accessToken: tok.accessToken,
    clubId: env.NAVER_CAFE_CLUB_ID,
    menuId: env.NAVER_TEST_MENUID,
  };
  const [redPath, bluePath] = ensureFixtures();
  const PREFIX = '[API 테스트-삭제예정] ';
  const body = '동아리 운영 자동화 Phase 0 글쓰기 검증. 한글 본문 UTF-8 인코딩 확인용. 🐾';

  const cases = [
    {
      name: '① 텍스트만',
      fn: () => postArticleText({ ...base, subject: `${PREFIX}텍스트 ${stamp()}`, content: body }),
    },
    {
      name: '② 이미지 1장',
      fn: () =>
        postArticleWithImages({
          ...base,
          subject: `${PREFIX}이미지1 ${stamp()}`,
          content: body,
          images: [loadImage(redPath)],
        }),
    },
    {
      name: '③ 이미지 2장',
      fn: () =>
        postArticleWithImages({
          ...base,
          subject: `${PREFIX}이미지2 ${stamp()}`,
          content: body,
          images: [loadImage(redPath), loadImage(bluePath)],
        }),
    },
  ];

  console.log(`카페 글쓰기 검증 — clubId=${base.clubId}, menuId=${base.menuId}`);
  console.log('※ 테스트 게시판에서만 실행하세요. 게시된 글은 사람이 직접 삭제해야 합니다(삭제 API 없음).\n');

  const results = [];
  for (const c of cases) {
    process.stdout.write(`${c.name} … `);
    try {
      const r = await c.fn();
      if (r.ok && r.articleUrl) {
        console.log(`성공 [HTTP ${r.status}] → ${r.articleUrl}`);
        results.push({ name: c.name, ok: true, status: r.status, url: r.articleUrl });
      } else {
        console.log(`실패 [HTTP ${r.status}] — ${interpret(r.status)}`);
        console.log('   응답:', JSON.stringify(r.raw));
        results.push({ name: c.name, ok: false, status: r.status });
      }
    } catch (e) {
      console.log(`예외 — ${e.message}`);
      results.push({ name: c.name, ok: false, status: 0 });
    }
  }

  const passed = results.filter((r) => r.ok).length;

  console.log('\n요약');
  console.log('─'.repeat(52));
  for (const r of results) {
    const mark = r.ok ? '✅' : '❌';
    const tail = r.ok ? `  ${r.url}` : `  (${interpret(r.status)})`;
    console.log(`  ${mark} ${r.name.padEnd(9)} HTTP ${String(r.status || '-').padStart(3)}${tail}`);
  }
  console.log('─'.repeat(52));
  console.log(`  결과: ${passed}/${results.length} 성공`);

  const verdict = passed === results.length ? 'GO' : 'NO-GO';
  const today = new Date().toISOString().slice(0, 10);
  console.log('\n04-TODO / 05-ASSET-REGISTRY 기록용 한 줄(복사):');
  console.log(`  [${verdict}] 카페 글쓰기 검증 ${passed}/3 성공 (${today}) — 텍스트/이미지1/이미지2`);

  if (passed === results.length) {
    console.log('\n게시된 테스트 글 3건을 카페에서 직접 삭제하세요(API 삭제 불가).');
  } else {
    console.log('\n원인 힌트: 401=토큰 / 403=카페 미가입·등급·게시판 권한 / 404=clubid·menuid.');
    process.exitCode = 1;
  }
}

run().catch((e) => {
  console.error('\n치명적 오류:', e.message);
  process.exitCode = 1;
});
