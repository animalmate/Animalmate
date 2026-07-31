import { readFileSync } from 'node:fs';
import { chromium, devices } from '@playwright/test';
const cookie = readFileSync('D:/git/Animalmate/.qa-cookie.txt','utf8').match(/SESSION_COOKIE=(\S+)/)[1];
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 14'] });
await ctx.addCookies([{ name:'am_session', value:cookie, domain:'localhost', path:'/', httpOnly:true }]);
const p = await ctx.newPage();
for (const path of ['/admin/members', '/admin/join-codes', '/']) {
  await p.goto('http://localhost:3100'+path, { waitUntil:'networkidle' });
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const burger = await p.getByLabel('메뉴').isVisible().catch(()=>false);
  console.log(`${path}: 가로초과=${over}px 햄버거=${burger}`);
}
// 햄버거 열어서 메뉴가 다 나오는지
await p.goto('http://localhost:3100/admin/members', { waitUntil:'networkidle' });
await p.getByLabel('메뉴').click();
await p.waitForTimeout(600);
const items = await p.locator('#console-mobile-menu a').count();
console.log('햄버거 안 메뉴 개수:', items);
await p.screenshot({ path:'D:/git/Animalmate/.qa-shots/18-mobile-menu.png', fullPage:true });
await b.close();
