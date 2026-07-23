// ⚠️⚠️⚠️ 실행 금지 — 관리자(리포 소유자) 승인 신호 전까지 절대 실행하지 말 것. ⚠️⚠️⚠️
// 이 스크립트는 실제 카페 발행 검증용으로, 테스트 게시판(menuid 68)에 "N분 뒤 발행" 예약 글
// 1건을 넣는다. 발행 워커가 NAVER_PUBLISH_DRY_RUN=false 로 돌면 실제 카페에 게시되고,
// 카페 API 는 삭제가 없으므로 게시글은 사람이 수동 삭제해야 한다.
//
// 안전장치: --confirm 인자가 없으면 아무 것도 하지 않고 경고만 출력한다.
// 실행(승인 후): node scripts/schedule-test-post.mjs --confirm [분]     (기본 5분 뒤)
//
// scheduled_posts 서비스(createDraft→markReady→schedulePost)의 최종 상태('scheduled')를
// 그대로 재현한다(스크립트는 .mjs 라 TS 서비스를 직접 import 할 수 없어 동등 SQL 사용).

import './load-env.mjs';
import postgres from 'postgres';

const TEST_MENUID = 68; // 30기 자기소개(테스트 전용 게시판)
const BOT_EMAIL = 'bot@animalmate.local';

const args = process.argv.slice(2);
const confirmed = args.includes('--confirm');
const minutes = Number(args.find((a) => /^\d+$/.test(a)) ?? '5');

if (!confirmed) {
  console.log('⚠️  안전장치: --confirm 없이 실행되어 아무 것도 하지 않았습니다.');
  console.log('   실제 카페 발행 검증은 관리자 승인 후에만: node scripts/schedule-test-post.mjs --confirm 5');
  console.log('   (추가로 발행 워커가 NAVER_PUBLISH_DRY_RUN=false 여야 실제 게시됩니다.)');
  process.exit(0);
}

async function run() {
  const dbUrl = (process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '').trim();
  if (!dbUrl) {
    console.error('❌ DIRECT_URL(또는 DATABASE_URL) 가 필요합니다(.env).');
    process.exit(1);
  }
  const sql = postgres(dbUrl, { prepare: false, max: 1 });
  try {
    // 게시판 68 존재 보장(FK). 없으면 봇 쓰기 가능으로 등록.
    await sql`
      insert into boards (menuid, name, purpose, bot_can_write, is_active)
      values (${TEST_MENUID}, '30기 자기소개', '실카페 발행 검증(테스트 전용)', true, true)
      on conflict (menuid) do nothing`;

    // 발행 주체(봇) 사용자 보장(author_user_id FK).
    const [author] = await sql`
      insert into users (email, name) values (${BOT_EMAIL}, '발행봇')
      on conflict (email) do update set name = excluded.name
      returning id`;

    const publishAt = new Date(Date.now() + minutes * 60_000);
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const [post] = await sql`
      insert into scheduled_posts
        (owner_type, owner_id, author_user_id, board_menuid, title, content_md, publish_at, status)
      values
        ('personal', ${author.id}, ${author.id}, ${TEST_MENUID},
         ${'[발행 검증-삭제예정] ' + stamp}, ${'발행 워커 실카페 검증용 예약 글. 🐾'},
         ${publishAt}, 'scheduled')
      returning id, publish_at`;

    console.log(`✅ 예약 글 1건 삽입(scheduled). id=${post.id}`);
    console.log(`   게시판 menuid=${TEST_MENUID}, 발행 예정=${post.publish_at.toISOString()} (약 ${minutes}분 뒤)`);
    console.log('   실제 게시되려면 발행 워커가 NAVER_PUBLISH_DRY_RUN=false 로 호출돼야 합니다.');
    console.log('   게시 후 카페에서 해당 글을 수동 삭제하세요(카페 삭제 API 없음).');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

run().catch((e) => {
  console.error('\n치명적 오류:', e.message);
  process.exitCode = 1;
});
