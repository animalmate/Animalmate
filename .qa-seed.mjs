// 회장단 콘솔 워크스루 준비 — **테스트 DB 전용**. 회장단 1명 + 승격 대상 부원 3명 + QA 팀 1개.
import 'dotenv/config';
import postgres from 'postgres';
import { createHmac } from 'node:crypto';

const sql = postgres(process.env.TEST_DATABASE_URL, { prepare: false, max: 1 });
const BOARD = 'qa-board@example.invalid';
const MEMBERS = ['qa-m1@example.invalid', 'qa-m2@example.invalid', 'qa-m3@example.invalid'];
const TEAM = 'QA봉사팀';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function signSession(sub, role, sv, secret) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64({ sub, role, sv, iat: now, exp: now + 3600 });
  const sig = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}

try {
  // 기존 QA 잔여 정리(FK 순서 주의)
  await sql`delete from join_codes where code like 'QA%'`;
  await sql`delete from team_members where user_id in (select id from users where email like 'qa-%@example.invalid')`;
  await sql`delete from memberships where user_id in (select id from users where email like 'qa-%@example.invalid')`;
  await sql`delete from audit_logs where actor_user_id in (select id from users where email like 'qa-%@example.invalid')`;
  await sql`delete from users where email like 'qa-%@example.invalid'`;
  await sql`delete from teams where name = ${TEAM}`;

  const today = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + 183 * 86400000).toISOString().slice(0, 10);

  const [board] = await sql`insert into users (email, name, phone) values (${BOARD}, 'QA회장', '01000000000') returning id, session_version`;
  await sql`insert into memberships (user_id, role, term_start, term_end, status)
            values (${board.id}, 'board', ${today}, ${end}, 'active')`;

  for (const [i, e] of MEMBERS.entries()) {
    const [u] = await sql`insert into users (email, name, phone) values (${e}, ${'QA부원' + (i + 1)}, ${'0101111000' + i}) returning id`;
    await sql`insert into memberships (user_id, role, term_start, term_end, status)
              values (${u.id}, 'member', ${today}, ${end}, 'active')`;
  }

  await sql`insert into teams (name, kind, is_active) values (${TEAM}, 'activity', true)`;

  const cookie = signSession(board.id, 'board', board.session_version, process.env.SESSION_SECRET);
  console.log('SESSION_COOKIE=' + cookie);
  console.log('회장단 1 / 부원 3 / 팀 1 준비 완료');
} finally {
  await sql.end({ timeout: 5 });
}
