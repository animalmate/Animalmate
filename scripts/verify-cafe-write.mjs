// Phase 0 GO/NO-GO 게이트: 네이버 카페 글쓰기 API 실호출 검증.
//
// 04-TODO Phase 0 DoD: 테스트 게시판에 실제 글 3건 게시 + 응답의 글 URL 확보
//   1) 텍스트만
//   2) 이미지 multipart (1장)
//   3) 이미지 multipart (2장 — 파라미터 반복 검증)
//   ※ 모두 동일 menuid(NAVER_TEST_MENUID) 지정으로 게시판 라우팅도 함께 검증.
//
// 실행: node scripts/verify-cafe-write.mjs
// 필요 env: NAVER_ACCESS_TOKEN, NAVER_CAFE_CLUB_ID, NAVER_TEST_MENUID
//
// 주의: 이 스크립트는 "테스트 게시판"에만 사용한다. 카페 API는 삭제가 불가하므로
//       게시된 글은 사람이 카페에서 직접 지워야 한다.

import './load-env.mjs';
import { requireEnv, postArticleText, postArticleWithImages } from './lib/naver.mjs';

// 1x1 투명 PNG (외부 파일 의존 없이 이미지 업로드 경로를 검증하기 위한 최소 바이트).
const PNG_1x1 = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  ),
  (c) => c.charCodeAt(0)
);

function image(name) {
  return { filename: name, bytes: PNG_1x1, contentType: 'image/png' };
}

function stamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

async function run() {
  const env = requireEnv(['NAVER_ACCESS_TOKEN', 'NAVER_CAFE_CLUB_ID', 'NAVER_TEST_MENUID']);
  const base = {
    accessToken: env.NAVER_ACCESS_TOKEN,
    clubId: env.NAVER_CAFE_CLUB_ID,
    menuId: env.NAVER_TEST_MENUID,
  };

  const cases = [
    {
      name: '① 텍스트 글',
      fn: () =>
        postArticleText({
          ...base,
          subject: `[검증] 텍스트 ${stamp()}`,
          content: '동아리 운영 자동화 Phase 0 글쓰기 API 검증(텍스트).',
        }),
    },
    {
      name: '② 이미지 1장',
      fn: () =>
        postArticleWithImages({
          ...base,
          subject: `[검증] 이미지1 ${stamp()}`,
          content: '이미지 multipart 업로드 검증(1장).',
          images: [image('verify-1.png')],
        }),
    },
    {
      name: '③ 이미지 2장',
      fn: () =>
        postArticleWithImages({
          ...base,
          subject: `[검증] 이미지2 ${stamp()}`,
          content: '이미지 파라미터 반복(다중 첨부) 검증(2장).',
          images: [image('verify-2a.png'), image('verify-2b.png')],
        }),
    },
  ];

  console.log(`\n네이버 카페 글쓰기 검증 시작 — clubId=${base.clubId}, menuId=${base.menuId}\n`);
  const results = [];
  for (const c of cases) {
    process.stdout.write(`${c.name} ... `);
    try {
      const r = await c.fn();
      if (r.ok && r.articleUrl) {
        console.log(`성공 → ${r.articleUrl}`);
        results.push({ name: c.name, ok: true, url: r.articleUrl });
      } else {
        console.log(`실패 (status ${r.status})`);
        console.log('   응답:', JSON.stringify(r.raw));
        results.push({ name: c.name, ok: false, status: r.status, raw: r.raw });
      }
    } catch (e) {
      console.log('예외:', e.message);
      results.push({ name: c.name, ok: false, error: e.message });
    }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n결과: ${passed}/${cases.length} 성공`);
  if (passed === cases.length) {
    console.log('\n✅ GO 조건 충족: 글 3건 게시 + URL 확보. 04-TODO Phase 0 항목 체크 가능.');
    console.log('   게시된 테스트 글은 카페에서 직접 삭제하세요(API 삭제 불가).');
  } else {
    console.log('\n❌ 일부 실패. GO/NO-GO 판단에 반영하세요.');
    console.log('   자주 나오는 원인: 토큰 만료(→ refresh-cafe-token.mjs 먼저), 봇 계정 게시판 쓰기 권한(등급) 미부여, menuid 오류.');
    process.exitCode = 1;
  }
}

run().catch((e) => {
  console.error('\n치명적 오류:', e.message);
  process.exitCode = 1;
});
