import './load-env.mjs';
import { db } from '../src/db/client.ts';
import { refreshAndStore } from '../src/naver/token-service.ts';
import { postArticle } from '../src/naver/cafe-write.ts';

async function run() {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  const clubId = process.env.NAVER_CAFE_CLUB_ID;
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;

  if (!clientId || !clientSecret || !clubId || !keyHex) {
    console.error('❌ 환경 변수 누락 (NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, NAVER_CAFE_CLUB_ID, TOKEN_ENCRYPTION_KEY 필요)');
    process.exit(1);
  }

  const key = Buffer.from(keyHex, 'hex');

  console.log('DB에서 Naver refresh token을 읽어 access token 갱신 중 …');
  const tokenObj = await refreshAndStore(db, { key, clientId, clientSecret });
  console.log('✅ access token 확보 완료');

  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const subject = `[API 줄바꿈/이스케이프 검증] ${stamp}`;

  // 검증 케이스: 한 줄 / 빈 줄 1개 / 빈 줄 3개 / 꺾쇠 등 특수문자 포함
  const content = `첫번째 한 줄입니다.

빈 줄 1개 아래 줄입니다.




빈 줄 3개 아래 줄입니다.
<태그> & "큰따옴표" '작은따옴표' <script>alert("test")</script>`;

  console.log('실제 테스트 게시글 발행 중 (menuid 68) ...');
  const res = await postArticle(
    {
      accessToken: tokenObj.accessToken,
      clubId,
      menuId: '68',
      subject,
      content,
    },
    { dryRun: false }
  );

  console.log('\n발행 결과:');
  console.log('Status:', res.status);
  console.log('Article URL:', res.articleUrl);
  console.log('Raw:', JSON.stringify(res.raw));

  if (res.ok && res.articleUrl) {
    console.log(`\n✅ 게시 성공! 게시글 URL: ${res.articleUrl}`);
    console.log('사용자가 확인 후 이 글을 수동 삭제하세요.');
  } else {
    console.error('❌ 게시 실패');
  }

  process.exit(0);
}

run().catch((e) => {
  console.error('실행 중 예외:', e);
  process.exit(1);
});
