// 회장단 콘솔 워크스루 — 오늘 저녁 사용자가 30명을 처리할 화면.
// 가입코드 발급 → 회원 목록 → 역할 승격 → 팀 배정까지 실제로 눌러 본다(테스트 DB).
import 'dotenv/config';
import { chromium, devices } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import postgres from 'postgres';

const BASE = 'http://localhost:3100';
const OUT = 'D:/git/Animalmate/.qa-shots';
mkdirSync(OUT, { recursive: true });
const cookie = readFileSync('D:/git/Animalmate/.qa-cookie.txt', 'utf8').match(/SESSION_COOKIE=(\S+)/)[1];
const sql = postgres(process.env.TEST_DATABASE_URL, { prepare: false, max: 1 });

const problems = [];
const browser = await chromium.launch();

async function makeCtx(deviceName) {
  const ctx = await browser.newContext(deviceName ? { ...devices[deviceName] } : { viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: 'am_session', value: cookie, domain: 'localhost', path: '/', httpOnly: true }]);
  return ctx;
}

async function watch(page, label) {
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[${label}] console.error: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => problems.push(`[${label}] pageerror: ${String(e).slice(0, 200)}`));
}
const noOverflow = async (page, label) => {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (o > 0) problems.push(`[${label}] 가로 스크롤 ${o}px`);
};

try {
  // ── 데스크톱: 가입코드 발급 ─────────────────────────────────────
  const ctx = await makeCtx(null);
  const page = await ctx.newPage();
  await watch(page, '가입코드');
  await page.goto(`${BASE}/admin/join-codes`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/10-joincode-before.png`, fullPage: true });
  await noOverflow(page, '가입코드');

  const bodyBefore = await page.locator('body').innerText();
  if (!/아직 발급된 코드가 없습니다/.test(bodyBefore)) {
    problems.push(`가입코드 없음 상태 문구가 안 보인다: ${bodyBefore.slice(0, 150)}`);
  }

  // 학기 이름 + 코드 입력해 발급
  const inputs = page.locator('input');
  await inputs.nth(0).fill('QA-2026-1');
  await inputs.nth(1).fill('QATEST9');
  await page.getByRole('button', { name: /발급|재발급/ }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/11-joincode-after.png`, fullPage: true });

  const bodyAfter = await page.locator('body').innerText();
  if (!bodyAfter.includes('QATEST9')) problems.push('발급했는데 활성 코드에 안 나타난다');

  const [dbCode] = await sql`select code, is_active from join_codes where is_active = true`;
  if (!dbCode || dbCode.code !== 'QATEST9') problems.push(`DB 활성 코드가 다르다: ${dbCode?.code}`);

  // ── 데스크톱: 회원·팀 관리 ──────────────────────────────────────
  const page2 = await ctx.newPage();
  await watch(page2, '회원관리');
  await page2.goto(`${BASE}/admin/members`, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(1200);
  await page2.screenshot({ path: `${OUT}/12-members.png`, fullPage: true });
  await noOverflow(page2, '회원관리');

  const membersText = await page2.locator('body').innerText();
  for (const n of ['QA부원1', 'QA부원2', 'QA부원3', 'QA회장']) {
    if (!membersText.includes(n)) problems.push(`회원 목록에 ${n} 이 없다`);
  }

  // 역할 승격: 부원1 → 운영진
  const roleSelects = page2.locator('select');
  const selCount = await roleSelects.count();
  if (selCount === 0) problems.push('역할 지정 select 가 없다');
  else {
    // QA부원1 카드 안의 역할 select 를 찾는다.
    const card = page2.locator('li', { hasText: 'QA부원1' }).first();
    const sel = card.locator('select').first();
    await sel.selectOption('staff');
    await page2.waitForTimeout(1800);
    const [m] = await sql`select m.role from memberships m join users u on u.id=m.user_id
                          where u.email='qa-m1@example.invalid' and m.status='active'`;
    if (m?.role !== 'staff') problems.push(`승격이 DB 에 반영되지 않았다: ${m?.role}`);
    await page2.screenshot({ path: `${OUT}/13-promoted.png`, fullPage: true });
  }

  // ── 휴대폰 폭에서도 회원 관리가 읽히는가 ────────────────────────
  const mctx = await makeCtx('iPhone 14');
  const mpage = await mctx.newPage();
  await watch(mpage, '회원관리(모바일)');
  await mpage.goto(`${BASE}/admin/members`, { waitUntil: 'networkidle' });
  await mpage.waitForTimeout(1200);
  await mpage.screenshot({ path: `${OUT}/14-members-mobile.png`, fullPage: true });
  await noOverflow(mpage, '회원관리(모바일)');

  const mjoin = await mctx.newPage();
  await mjoin.goto(`${BASE}/admin/join-codes`, { waitUntil: 'networkidle' });
  await mjoin.screenshot({ path: `${OUT}/15-joincode-mobile.png`, fullPage: true });
  await noOverflow(mjoin, '가입코드(모바일)');
} catch (e) {
  problems.push(`[중단] ${e.message.slice(0, 300)}`);
} finally {
  console.log('\n=== 발견 ===');
  console.log(problems.length === 0 ? '없음' : problems.map((p) => ' - ' + p).join('\n'));
  await browser.close();
  await sql.end({ timeout: 5 });
}
